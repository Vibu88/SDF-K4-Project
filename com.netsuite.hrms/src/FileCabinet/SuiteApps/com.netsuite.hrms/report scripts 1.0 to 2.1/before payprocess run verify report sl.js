/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 * @Description Read-Only Payroll Summary Verification Report Suitelet. Uses core module calculation functions to preview summary data per employee without saving any records.
 *              Filters: Subsidiary + Pay Group (active wage month / year / start date / end date are derived from the Pay Group).
 *              Governance-safe: server-side pagination + batched saved-search style lookups (no record.load per employee / per component).
 */
define(['N/ui/serverWidget', 'N/search', 'N/record', 'N/log', 'N/format', 'N/runtime', 'N/redirect'],

    (serverWidget, search, record, log, format, runtime, redirect) => {

        const CUSTOM_RECORDS = {
            PRE_PAY_PROCESS: 'customrecord_hris_pre_pay_process_record',
            EMP_COMP_CHANGE: 'customrecord_hris_employee_compen_change',
            PAYROLL_COMPONENT: 'customrecord_hris_payroll_component',
            UNPAID_LEAVE: 'customrecord_hris_unpaid_leave_entry',
            UNPAID_ARREAR: 'customrecord_hris_unpaid_arrear_entry',
            MONTHLY_SAL: 'customrecord_hris_monthlysalinput',
            SALARY_ADJ: 'customrecord_hris_salary_adjustment_entr',
            WAGE_PERIOD: 'customrecord_hris_wage_period_details',
            LOAN_APP: 'customrecord_hris_empchange_loan_applicn',
            LOAN_CHILD: 'customrecord_hris_loan_applicat_child',
            LOAN_MASTER: 'customrecord_hris_loan_master',
            GLOBAL_PARAM: 'customrecord_hris_global_parameter',
            COMPONENT_TYPE: 'customrecord_hris_component_type',
            PT_SLAB: 'customrecord_hris_pt_slap_master',
            SS_FIN_YEAR: 'customrecord_hris_ss_financial_year',
            MONTHLY_ATTENDANCE: 'customrecord_hrms_monthlyattendance',
            YEAR_MASTER: 'customlist_hris_year_master',
            PROCESS_GROUP: 'customrecord_hris_process_groupmaster'
        };

        // Pagination settings
        const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
        const DEFAULT_PAGE_SIZE = 25;

        // Collects employee-detail read errors for the current request (shown as a small warning if names cannot be read)
        let detailErrors = [];

        const getWagePeriodNo = (wageName) => {
            const monthMap = {
                'January': '1', 'February': '2', 'March': '3', 'April': '4',
                'May': '5', 'June': '6', 'July': '7', 'August': '8',
                'September': '9', 'October': '10', 'November': '11', 'December': '12'
            };
            return monthMap[wageName] || wageName;
        };

        const getMonthDays = (monthNum) => {
            const m = getWagePeriodNo(monthNum);
            if (['1', '3', '5', '7', '8', '10', '12'].includes(m)) return 31;
            if (['4', '6', '9', '11'].includes(m)) return 30;
            if (m === '2') {
                const year = new Date().getFullYear();
                return (year % 4 === 0) ? 29 : 28;
            }
            return 30;
        };

        const getWagePeriodYear = (payGroup, wagePeriodId) => {
            try {
                const wageSearch = search.create({
                    type: CUSTOM_RECORDS.WAGE_PERIOD,
                    filters: [
                        ['custrecord_hris_pay_group', 'anyof', payGroup],
                        'AND',
                        ['custrecord_hris_month', 'is', wagePeriodId],
                        'AND',
                        ['isinactive', 'is', 'F']
                    ],
                    columns: ['custrecord_hris_year', 'custrecord_hris_end_date', 'custrecord_hris_start_date']
                });
                const result = wageSearch.run().getRange({ start: 0, end: 1 });
                return result.length > 0
                    ? {
                        yearId: result[0].getValue('custrecord_hris_year'),
                        yearText: result[0].getText('custrecord_hris_year'),
                        startDate: result[0].getValue('custrecord_hris_start_date'),
                        endDate: result[0].getValue('custrecord_hris_end_date')
                    }
                    : { yearId: '', yearText: '', startDate: '', endDate: '' };
            } catch (e) {
                return { yearId: '', yearText: '', startDate: '', endDate: '' };
            }
        };

        /**
         * Finds the ACTIVE wage period of a Pay Group.
         * Active = the wage period whose start date / end date contains today.
         * If none contains today, the latest wage period (by start date) is used.
         * Returns the wage month name, year and start / end dates.
         */
        const getActiveWagePeriod = (payGroup) => {
            const empty = { monthText: '', monthId: '', yearId: '', yearText: '', startDate: '', endDate: '' };
            try {
                const wageSearch = search.create({
                    type: CUSTOM_RECORDS.WAGE_PERIOD,
                    filters: [
                        ['custrecord_hris_pay_group', 'anyof', payGroup],
                        'AND',
                        ['isinactive', 'is', 'F']
                    ],
                    columns: [
                        search.createColumn({ name: 'custrecord_hris_start_date', sort: search.Sort.DESC }),
                        search.createColumn({ name: 'custrecord_hris_end_date' }),
                        search.createColumn({ name: 'custrecord_hris_month' }),
                        search.createColumn({ name: 'custrecord_hris_year' })
                    ]
                });
                const results = wageSearch.run().getRange({ start: 0, end: 100 });
                if (!results || results.length === 0) return empty;

                const today = new Date();
                today.setHours(0, 0, 0, 0);

                let pick = results[0];
                for (let i = 0; i < results.length; i++) {
                    try {
                        const sd = format.parse({ value: results[i].getValue('custrecord_hris_start_date'), type: format.Type.DATE });
                        const ed = format.parse({ value: results[i].getValue('custrecord_hris_end_date'), type: format.Type.DATE });
                        if (sd && ed && today >= sd && today <= ed) {
                            pick = results[i];
                            break;
                        }
                    } catch (pe) {}
                }

                return {
                    monthText: pick.getText('custrecord_hris_month') || pick.getValue('custrecord_hris_month') || '',
                    monthId: pick.getValue('custrecord_hris_month'),
                    yearId: pick.getValue('custrecord_hris_year'),
                    yearText: pick.getText('custrecord_hris_year') || pick.getValue('custrecord_hris_year') || '',
                    startDate: pick.getValue('custrecord_hris_start_date'),
                    endDate: pick.getValue('custrecord_hris_end_date')
                };
            } catch (e) {
                log.error('getActiveWagePeriod Error', e.message);
                return empty;
            }
        };

        const getPaidDays = (empId, wagePeriodId, monthDays, getYear) => {
            try {
                const attSearch = search.create({
                    type: CUSTOM_RECORDS.MONTHLY_ATTENDANCE,
                    filters: [
                        ['custrecord_hrms_month_empid', 'anyof', empId],
                        'AND',
                        ['custrecord_hrms_month_monthid', 'anyof', wagePeriodId],
                        'AND',
                        ['custrecord_hrms_month_yearid', 'anyof', getYear],
                        'AND',
                        ['isinactive', 'is', 'F']
                    ],
                    columns: ['custrecord_hrms_month_presentdays', 'custrecord_hrms_month_absentdays']
                });
                const result = attSearch.run().getRange({ start: 0, end: 1 });
                return result.length > 0
                    ? parseFloat(result[0].getValue('custrecord_hrms_month_presentdays') || 0)
                    : monthDays;
            } catch (e) {
                return monthDays;
            }
        };

        const getAttendanceDetailsMap = (empIds, wagePeriodId, getYear) => {
            const map = {};
            if (!empIds || empIds.length === 0) return map;
            try {
                chunkArray(empIds, 500).forEach(chunk => {
                    const attSearch = search.create({
                        type: CUSTOM_RECORDS.MONTHLY_ATTENDANCE,
                        filters: [
                            ['custrecord_hrms_month_empid', 'anyof', chunk],
                            'AND',
                            ['custrecord_hrms_month_monthid', 'anyof', wagePeriodId],
                            'AND',
                            ['custrecord_hrms_month_yearid', 'anyof', getYear],
                            'AND',
                            ['isinactive', 'is', 'F']
                        ],
                        columns: [
                            search.createColumn({ name: 'custrecord_hrms_month_empid' }),
                            search.createColumn({ name: 'custrecord_hrms_month_presentdays' }),
                            search.createColumn({ name: 'custrecord_hrms_month_absentdays' })
                        ]
                    });
                    runAllPaged(attSearch, r => {
                        const empId = String(r.getValue('custrecord_hrms_month_empid'));
                        if (empId) {
                            map[empId] = {
                                presentDays: parseFloat(r.getValue('custrecord_hrms_month_presentdays') || 0),
                                absentDays: parseFloat(r.getValue('custrecord_hrms_month_absentdays') || 0)
                            };
                        }
                    });
                });
            } catch (e) {
                log.error('getAttendanceDetailsMap Error', e.message);
            }
            return map;
        };

        const getMonthlySalInputMap = (empIds, wagePeriodId, getYear, payGroup, subsidiary) => {
            const map = {};
            if (!empIds || empIds.length === 0) return map;
            try {
                chunkArray(empIds, 500).forEach(chunk => {
                    const filters = [
                        ['custrecord_hris_mthsal_empname', 'anyof', chunk],
                        'AND',
                        ['custrecord_hris_mthsal_month', 'anyof', wagePeriodId],
                        'AND',
                        ['custrecord_hris_mthsal_year', 'anyof', getYear],
                        'AND',
                        ['custrecord_hris_mthsal_paygroup', 'anyof', payGroup],
                        'AND',
                        ['isinactive', 'is', 'F']
                    ];
                    if (subsidiary) {
                        filters.push('AND');
                        filters.push(['custrecord_hris_mthsal_subsidiary', 'anyof', subsidiary]);
                    }
                    const salSearch = search.create({
                        type: CUSTOM_RECORDS.MONTHLY_SAL,
                        filters: filters,
                        columns: [
                            search.createColumn({ name: 'custrecord_hris_mthsal_empname' }),
                            search.createColumn({ name: 'custrecord_hris_mthsal_paycomponent' }),
                            search.createColumn({ name: 'custrecord_hris_mthsal_salaryamount' })
                        ]
                    });
                    runAllPaged(salSearch, r => {
                        const empId = String(r.getValue('custrecord_hris_mthsal_empname'));
                        const comp = r.getValue('custrecord_hris_mthsal_paycomponent');
                        const amt = parseFloat(r.getValue('custrecord_hris_mthsal_salaryamount') || 0);
                        if (empId && comp && amt > 0) {
                            if (!map[empId]) map[empId] = [];
                            map[empId].push({
                                component: String(comp),
                                componentText: r.getText('custrecord_hris_mthsal_paycomponent') || '',
                                amount: amt
                            });
                        }
                    });
                });
            } catch (e) {
                log.error('getMonthlySalInputMap Error', e.message);
            }
            return map;
        };

        const getLoanDeductionsMap = (empIds, wagePeriodStartDate, wagePeriodEndDate) => {
            const map = {};
            if (!empIds || empIds.length === 0 || !wagePeriodStartDate || !wagePeriodEndDate) return map;
            try {
                chunkArray(empIds, 500).forEach(chunk => {
                    const loanSearch = search.create({
                        type: CUSTOM_RECORDS.LOAN_APP,
                        filters: [
                            ['custrecord_hris_loan_emp_name', 'anyof', chunk],
                            'AND',
                            ['isinactive', 'is', 'F']
                        ],
                        columns: [
                            search.createColumn({ name: 'custrecord_hris_loan_emp_name' }),
                            search.createColumn({ name: 'custrecord_hris_loan_loan_type' }),
                            search.createColumn({ name: 'custrecord_hris_loan_alloc_link', join: 'custrecord_hris_loan_alloc_link' }),
                            search.createColumn({ name: 'custrecord_hris_loan_alloc_startdate', join: 'custrecord_hris_loan_alloc_link' }),
                            search.createColumn({ name: 'custrecord_hris_loan_alloc_enddate', join: 'custrecord_hris_loan_alloc_link' }),
                            search.createColumn({ name: 'custrecord_hris_loan_alloc_paidamount', join: 'custrecord_hris_loan_alloc_link' })
                        ]
                    });
                    runAllPaged(loanSearch, r => {
                        const empId = String(r.getValue('custrecord_hris_loan_emp_name'));
                        const loanType = r.getValue('custrecord_hris_loan_loan_type');
                        const childStart = r.getValue({ name: 'custrecord_hris_loan_alloc_startdate', join: 'custrecord_hris_loan_alloc_link' });
                        const childEnd = r.getValue({ name: 'custrecord_hris_loan_alloc_enddate', join: 'custrecord_hris_loan_alloc_link' });
                        const paidAmt = parseFloat(r.getValue({ name: 'custrecord_hris_loan_alloc_paidamount', join: 'custrecord_hris_loan_alloc_link' }) || 0);

                        if (empId && paidAmt > 0 && childStart && childEnd) {
                            try {
                                const sd = format.parse({ value: childStart, type: format.Type.DATE });
                                const ed = format.parse({ value: childEnd, type: format.Type.DATE });
                                const wsd = format.parse({ value: wagePeriodStartDate, type: format.Type.DATE });
                                const wed = format.parse({ value: wagePeriodEndDate, type: format.Type.DATE });

                                if (sd && ed && wsd && wed && sd <= wed && ed >= wsd) {
                                    let componentId = '';
                                    let componentText = '';
                                    if (loanType) {
                                        try {
                                            const masterLookup = search.lookupFields({
                                                type: CUSTOM_RECORDS.LOAN_MASTER,
                                                id: loanType,
                                                columns: ['custrecord_hris_loan_component']
                                            });
                                            if (masterLookup.custrecord_hris_loan_component && masterLookup.custrecord_hris_loan_component.length > 0) {
                                                componentId = masterLookup.custrecord_hris_loan_component[0].value;
                                                componentText = masterLookup.custrecord_hris_loan_component[0].text;
                                            }
                                        } catch (lmErr) {}
                                    }

                                    if (!map[empId]) map[empId] = [];
                                    map[empId].push({
                                        component: String(componentId || loanType),
                                        componentText: componentText || 'Loan Deduction',
                                        amount: paidAmt,
                                        isLoan: true
                                    });
                                }
                            } catch (dateErr) {}
                        }
                    });
                });
            } catch (e) {
                log.error('getLoanDeductionsMap Error', e.message);
            }
            return map;
        };

        const getLOPDaysFinal = (empId, wagePeriodId, getYear) => {
            try {
                const lopSearch = search.create({
                    type: CUSTOM_RECORDS.UNPAID_LEAVE,
                    filters: [
                        ['custrecord_hris_ule_employee_name', 'anyof', empId],
                        'AND',
                        ['custrecord_hris_ule_month', 'is', wagePeriodId],
                        'AND',
                        ['custrecord_hris_ule_year', 'is', getYear],
                        'AND',
                        ['isinactive', 'is', 'F']
                    ],
                    columns: ['custrecord_hris_ule_noof_days']
                });
                let totalLop = 0;
                lopSearch.run().each(r => {
                    totalLop += parseFloat(r.getValue('custrecord_hris_ule_noof_days') || 0);
                    return true;
                });
                return totalLop;
            } catch (e) {
                return 0;
            }
        };

        const getArrearMonthDays = (empId, wagePeriodId, getYear) => {
            try {
                const arrSearch = search.create({
                    type: CUSTOM_RECORDS.UNPAID_ARREAR,
                    filters: [
                        ['custrecord_hris_uae_employee_name', 'anyof', empId],
                        'AND',
                        ['custrecord_hris_uae_month', 'is', wagePeriodId],
                        'AND',
                        ['custrecord_hris_uae_year', 'is', getYear],
                        'AND',
                        ['isinactive', 'is', 'F']
                    ],
                    columns: ['custrecord_hris_uae_arrear_month']
                });
                const result = arrSearch.run().getRange({ start: 0, end: 1 });
                return result.length > 0
                    ? getMonthDays(result[0].getValue('custrecord_hris_uae_arrear_month'))
                    : 30;
            } catch (e) {
                return 30;
            }
        };

        const getEmployeesForPayGroup = (payGroup, subsidiary) => {
            const empList = [];
            try {
                const filters = [
                    ['custrecord_hris_empchange_emp_pay_pro_gp', 'anyof', payGroup],
                    'AND',
                    ['isinactive', 'is', 'F']
                ];
                const searchEmp = search.create({
                    type: CUSTOM_RECORDS.EMP_COMP_CHANGE,
                    filters: filters,
                    columns: [
                        search.createColumn({ name: 'custrecord_hris_empchange_employee_nam', summary: 'GROUP' })
                    ]
                });
                searchEmp.run().each(r => {
                    const empId = r.getValue({ name: 'custrecord_hris_empchange_employee_nam', summary: 'GROUP' });
                    if (empId) {
                        try {
                            const empRec = record.load({ type: 'employee', id: empId });
                            const empSubsidiary = empRec.getValue('subsidiary');
                            if (!subsidiary || empSubsidiary === subsidiary) {
                                empList.push({
                                    empId: empId,
                                    empCode: empRec.getValue('custentity_hris_empcode') || '',
                                    empName: empRec.getValue('entitytitle') || empRec.getText('custrecord_hris_empchange_employee_nam') || '',
                                    subsidiary: empSubsidiary,
                                    subsidiaryText: empRec.getText('subsidiary') || '',
                                    ptApplicable: empRec.getValue('custentity_hris_emp_isptapplicable'),
                                    ptLoc: empRec.getValue('custentity_hris_empptlocation'),
                                    socialInsApp: empRec.getValue('custentity_hris_empsocialinsurapplicable')
                                });
                            }
                        } catch (err) {}
                    }
                    return true;
                });
            } catch (e) {
                log.error('getEmployeesForPayGroup Error', e.message);
            }
            return empList;
        };

        const calculateEmployeePreview = (emp, payGroup, wagePeriodId, getYear, monthDays) => {
            let totalEarnings = 0;
            let totalDeductions = 0;
            let ssGross = 0;
            const earningsList = [];
            const deductionsList = [];

            try {
                const arrearMonthDays = getArrearMonthDays(emp.empId, wagePeriodId, getYear);
                
                // 1. Earnings calculation
                const compSearch = search.create({
                    type: CUSTOM_RECORDS.EMP_COMP_CHANGE,
                    filters: [
                        ['custrecord_hris_empchange_emp_pay_pro_gp', 'anyof', payGroup],
                        'AND',
                        ['custrecord_hris_empchange_employee_nam', 'anyof', emp.empId],
                        'AND',
                        ['isinactive', 'is', 'F']
                    ],
                    columns: [
                        search.createColumn({ name: 'custrecord_hris_cde_payroll_component', join: 'custrecord_hris_employee_data_change' }),
                        search.createColumn({ name: 'custrecord_hris_cde_monthly', join: 'custrecord_hris_employee_data_change' })
                    ]
                });

                compSearch.run().each(result => {
                    const earnComponent = result.getValue({ name: 'custrecord_hris_cde_payroll_component', join: 'custrecord_hris_employee_data_change' });
                    const currentMonthly = parseFloat(result.getValue({ name: 'custrecord_hris_cde_monthly', join: 'custrecord_hris_employee_data_change' }) || 0);

                    if (currentMonthly > 0 && earnComponent) {
                        let compName = result.getText({ name: 'custrecord_hris_cde_payroll_component', join: 'custrecord_hris_employee_data_change' }) || 'Earning Component';
                        try {
                            const compRec = record.load({ type: CUSTOM_RECORDS.PAYROLL_COMPONENT, id: earnComponent });
                            if (compRec.getValue('custrecord_hris_ss')) {
                                ssGross += currentMonthly;
                            }
                            compName = compRec.getValue('name') || compName;
                        } catch (e) {}
                        totalEarnings += currentMonthly;
                        earningsList.push({ name: compName, amount: currentMonthly });
                    }
                    return true;
                });

                // 2. Deductions calculation
                const dedSearch = search.create({
                    type: CUSTOM_RECORDS.EMP_COMP_CHANGE,
                    filters: [
                        ['custrecord_hris_empchange_emp_pay_pro_gp', 'anyof', payGroup],
                        'AND',
                        ['custrecord_hris_empchange_employee_nam', 'anyof', emp.empId],
                        'AND',
                        ['isinactive', 'is', 'F']
                    ],
                    columns: [
                        search.createColumn({ name: 'custrecord_hris_cdb_payroll_component', join: 'custrecord_hris_employee_datachangeint' }),
                        search.createColumn({ name: 'custrecord_hris_cdb_monthly', join: 'custrecord_hris_employee_datachangeint' })
                    ]
                });

                dedSearch.run().each(result => {
                    const dedComponent = result.getValue({ name: 'custrecord_hris_cdb_payroll_component', join: 'custrecord_hris_employee_datachangeint' });
                    const currentMonthly = parseFloat(result.getValue({ name: 'custrecord_hris_cdb_monthly', join: 'custrecord_hris_employee_datachangeint' }) || 0);

                    if (currentMonthly > 0 && dedComponent) {
                        let dedName = result.getText({ name: 'custrecord_hris_cdb_payroll_component', join: 'custrecord_hris_employee_datachangeint' }) || 'Deduction Component';
                        try {
                            const compRec = record.load({ type: CUSTOM_RECORDS.PAYROLL_COMPONENT, id: dedComponent });
                            dedName = compRec.getValue('name') || dedName;
                        } catch (e) {}
                        totalDeductions += currentMonthly;
                        deductionsList.push({ name: dedName, amount: currentMonthly });
                    }
                    return true;
                });

            } catch (e) {
                log.error('calculateEmployeePreview Error', e.message);
            }

            return {
                totalEarnings: totalEarnings,
                totalDeductions: totalDeductions,
                netPay: totalEarnings - totalDeductions,
                earningsList: earningsList,
                deductionsList: deductionsList
            };
        };

        const getDropdownOptions = (type, filters = []) => {
            const options = [];
            try {
                const s = search.create({
                    type: type,
                    filters: filters,
                    columns: ['name']
                });
                s.run().each(r => {
                    options.push({ id: r.id, name: r.getValue('name') || r.getText('name') || r.id });
                    return true;
                });
            } catch (e) {}
            return options;
        };

        /* =====================================================================
         *  GOVERNANCE-SAFE / PAGINATED DATA LAYER
         *  (replaces per-employee record.load + per-employee/per-component searches)
         * ===================================================================== */

        // Runs a search with paging (1000 per page) and calls rowFn(result) for every row
        const runAllPaged = (searchObj, rowFn) => {
            const pagedData = searchObj.runPaged({ pageSize: 1000 });
            pagedData.pageRanges.forEach(pr => {
                const page = pagedData.fetch({ index: pr.index });
                page.data.forEach(r => rowFn(r));
            });
        };

        const chunkArray = (arr, size) => {
            const out = [];
            for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
            return out;
        };

        // 1 search: distinct employee ids of the pay group (subsidiary filter applied safely via grouped search columns)
        const getEmployeeIdsForPayGroup = (payGroup, subsidiary) => {
            const ids = [];
            const seen = {};
            try {
                const filters = [
                    ['custrecord_hris_empchange_emp_pay_pro_gp', 'anyof', payGroup],
                    'AND',
                    ['isinactive', 'is', 'F']
                ];
                const idSearch = search.create({
                    type: CUSTOM_RECORDS.EMP_COMP_CHANGE,
                    filters: filters,
                    columns: [
                        search.createColumn({ name: 'custrecord_hris_empchange_employee_nam', summary: 'GROUP', sort: search.Sort.ASC }),
                        search.createColumn({ name: 'subsidiary', join: 'custrecord_hris_empchange_employee_nam', summary: 'GROUP' })
                    ]
                });
                runAllPaged(idSearch, r => {
                    const empId = r.getValue({ name: 'custrecord_hris_empchange_employee_nam', summary: 'GROUP' });
                    const empSub = r.getValue({ name: 'subsidiary', join: 'custrecord_hris_empchange_employee_nam', summary: 'GROUP' });
                    if (empId && !seen[empId]) {
                        if (!subsidiary || empSub === subsidiary) {
                            seen[empId] = true;
                            ids.push(String(empId));
                        }
                    }
                });
            } catch (e) {
                log.error('getEmployeeIdsForPayGroup Error', e.message);
            }
            return ids;
        };

        // Employees whose Monthly Attendance for the wage month / year is marked "Process Completed" (custrecord_hrms_month_processcompleted = true)
        const getProcessedEmployeeSet = (wagePeriodId, getYear) => {
            const set = {};
            try {
                const attFilters = [
                    ['custrecord_hrms_month_monthid', 'anyof', wagePeriodId],
                    'AND',
                    ['custrecord_hrms_month_processcompleted', 'is', 'T'],
                    'AND',
                    ['isinactive', 'is', 'F']
                ];
                if (getYear) {
                    attFilters.push('AND');
                    attFilters.push(['custrecord_hrms_month_yearid', 'anyof', getYear]);
                }
                const attSearch = search.create({
                    type: CUSTOM_RECORDS.MONTHLY_ATTENDANCE,
                    filters: attFilters,
                    columns: [
                        search.createColumn({ name: 'custrecord_hrms_month_empid', summary: 'GROUP' })
                    ]
                });
                runAllPaged(attSearch, r => {
                    const id = r.getValue({ name: 'custrecord_hrms_month_empid', summary: 'GROUP' });
                    if (id) set[String(id)] = true;
                });
            } catch (e) {
                detailErrors.push('Monthly attendance (process completed): ' + e.message);
                log.error('getProcessedEmployeeSet Error', e.message);
            }
            return set;
        };

        // Payroll components of the pay group (custrecord_hris_pay_process_group), ordered by custrecord_hris_order_seqno
        const getPayrollComponentColumns = (payGroup) => {
            const cols = [];
            try {
                const compSearch = search.create({
                    type: CUSTOM_RECORDS.PAYROLL_COMPONENT,
                    filters: [
                        ['custrecord_hris_pay_process_group', 'anyof', payGroup],
                        'AND',
                        ['isinactive', 'is', 'F']
                    ],
                    columns: [
                        search.createColumn({ name: 'name' }),
                        search.createColumn({ name: 'custrecord_hris_order_seqno', sort: search.Sort.ASC })
                    ]
                });
                runAllPaged(compSearch, r => {
                    const seqVal = parseFloat(r.getValue('custrecord_hris_order_seqno'));
                    cols.push({
                        id: String(r.id),
                        name: r.getValue('name') || '',
                        seq: isNaN(seqVal) ? 999999 : seqVal
                    });
                });
                cols.sort((a, b) => a.seq - b.seq);
            } catch (e) {
                detailErrors.push('Payroll components: ' + e.message);
                log.error('getPayrollComponentColumns Error', e.message);
            }
            return cols;
        };

        // Builds employee name safely using entityid and internalid/entitytitle equivalent if altname is absent
        const buildEmpName = (entityId, altName) => {
            const eid = entityId || '';
            const alt = altName || '';
            if (!alt) return eid;
            return (eid && alt.indexOf(eid) === -1) ? (eid + ' ' + alt) : alt;
        };

        // Employee details for the page. Several strategies are chained so a name / subsidiary can never stay blank:
        //   1) joined columns on the compensation-change search (same join already used for the subsidiary filter)
        //   2) direct employee search
        //   3) search.lookupFields per missing employee (1 unit each)
        //   4) record.load per missing employee (only while enough governance is left)
        const getEmployeeDetailsMap = (empIds) => {
            const map = {};
            if (!empIds || empIds.length === 0) return map;
            const empLinkField = 'custrecord_hris_empchange_employee_nam';

            const newEntry = (empName, subsidiary, subsidiaryText) => {
                return {
                    empCode: '',
                    empName: empName || '',
                    subsidiary: subsidiary || '',
                    subsidiaryText: subsidiaryText || '',
                    ptApplicable: '',
                    ptLoc: '',
                    socialInsApp: ''
                };
            };

            // ---- Strategy 1: joined columns through the compensation change record ----
            try {
                const joinSearch = search.create({
                    type: CUSTOM_RECORDS.EMP_COMP_CHANGE,
                    filters: [
                        [empLinkField, 'anyof', empIds],
                        'AND',
                        ['isinactive', 'is', 'F']
                    ],
                    columns: [
                        search.createColumn({ name: empLinkField, summary: 'GROUP' }),
                        search.createColumn({ name: 'entityid', join: empLinkField, summary: 'GROUP' }),
                        search.createColumn({ name: 'subsidiary', join: empLinkField, summary: 'GROUP' })
                    ]
                });
                runAllPaged(joinSearch, r => {
                    const id = String(r.getValue({ name: empLinkField, summary: 'GROUP' }));
                    const entityId = r.getValue({ name: 'entityid', join: empLinkField, summary: 'GROUP' }) || '';
                    const subVal = r.getValue({ name: 'subsidiary', join: empLinkField, summary: 'GROUP' });
                    const subTxt = r.getText({ name: 'subsidiary', join: empLinkField, summary: 'GROUP' }) || '';
                    map[id] = newEntry(buildEmpName(entityId, ''), subVal, subTxt);
                });
            } catch (e1) {
                detailErrors.push('Join search: ' + e1.message);
                log.error('getEmployeeDetailsMap (join) Error', e1.message);
            }

            // ---- Strategy 2: direct employee search for anything still missing ----
            const missing2 = empIds.filter(id => !map[String(id)] || (!map[String(id)].empName && !map[String(id)].subsidiaryText));
            if (missing2.length > 0) {
                try {
                    const coreSearch = search.create({
                        type: 'employee',
                        filters: [['internalid', 'anyof', missing2]],
                        columns: [
                            search.createColumn({ name: 'entityid' }),
                            search.createColumn({ name: 'subsidiary' })
                        ]
                    });
                    runAllPaged(coreSearch, r => {
                        map[String(r.id)] = newEntry(
                            buildEmpName(r.getValue('entityid'), ''),
                            r.getValue('subsidiary'),
                            r.getText('subsidiary')
                        );
                    });
                } catch (e2) {
                    detailErrors.push('Employee search: ' + e2.message);
                    log.error('getEmployeeDetailsMap (employee search) Error', e2.message);
                }
            }

            // ---- Strategy 3: lookupFields for anything still missing ----
            const missing3 = empIds.filter(id => !map[String(id)] || (!map[String(id)].empName && !map[String(id)].subsidiaryText));
            missing3.forEach(id => {
                try {
                    const lf = search.lookupFields({ type: 'employee', id: id, columns: ['entityid', 'subsidiary'] });
                    const subObj = (lf.subsidiary && lf.subsidiary.length > 0) ? lf.subsidiary[0] : null;
                    map[String(id)] = newEntry(
                        buildEmpName(lf.entityid, ''),
                        subObj ? subObj.value : '',
                        subObj ? subObj.text : ''
                    );
                } catch (e3) {
                    detailErrors.push('lookupFields: ' + e3.message);
                    log.error('getEmployeeDetailsMap (lookupFields) Error', e3.message);
                }
            });

            // ---- Strategy 4: record.load (same as the original script) while enough governance is left ----
            const missing4 = empIds.filter(id => !map[String(id)] || (!map[String(id)].empName && !map[String(id)].subsidiaryText));
            missing4.forEach(id => {
                try {
                    if (runtime.getCurrentScript().getRemainingUsage() < 150) return;
                    const empRec = record.load({ type: 'employee', id: id });
                    map[String(id)] = newEntry(
                        empRec.getValue('entitytitle') || buildEmpName(empRec.getValue('entityid'), ''),
                        empRec.getValue('subsidiary'),
                        empRec.getText('subsidiary')
                    );
                    map[String(id)].empCode = empRec.getValue('custentity_hris_empcode') || '';
                    map[String(id)].ptApplicable = empRec.getValue('custentity_hris_emp_isptapplicable');
                    map[String(id)].ptLoc = empRec.getValue('custentity_hris_empptlocation');
                    map[String(id)].socialInsApp = empRec.getValue('custentity_hris_empsocialinsurapplicable');
                    map[String(id)].fullyLoaded = true;
                } catch (e4) {
                    detailErrors.push('record.load: ' + e4.message);
                    log.error('getEmployeeDetailsMap (record.load) Error', e4.message);
                }
            });

            // ---- Custom employee fields (code / PT / social insurance), each field in its own try/catch ----
            const optionalFields = [
                { field: 'custentity_hris_empcode', key: 'empCode' },
                { field: 'custentity_hris_emp_isptapplicable', key: 'ptApplicable' },
                { field: 'custentity_hris_empptlocation', key: 'ptLoc' },
                { field: 'custentity_hris_empsocialinsurapplicable', key: 'socialInsApp' }
            ];
            optionalFields.forEach(of => {
                let done = false;
                // a) joined through the compensation change record
                try {
                    const joinOpt = search.create({
                        type: CUSTOM_RECORDS.EMP_COMP_CHANGE,
                        filters: [
                            [empLinkField, 'anyof', empIds],
                            'AND',
                            ['isinactive', 'is', 'F']
                        ],
                        columns: [
                            search.createColumn({ name: empLinkField, summary: 'GROUP' }),
                            search.createColumn({ name: of.field, join: empLinkField, summary: 'GROUP' })
                        ]
                    });
                    runAllPaged(joinOpt, r => {
                        const target = map[String(r.getValue({ name: empLinkField, summary: 'GROUP' }))];
                        if (target && !target.fullyLoaded) {
                            target[of.key] = r.getValue({ name: of.field, join: empLinkField, summary: 'GROUP' }) || '';
                        }
                    });
                    done = true;
                } catch (oe1) {}
                // b) direct employee search
                if (!done) {
                    try {
                        const optSearch = search.create({
                            type: 'employee',
                            filters: [['internalid', 'anyof', empIds]],
                            columns: [search.createColumn({ name: of.field })]
                        });
                        runAllPaged(optSearch, r => {
                            const target = map[String(r.id)];
                            if (target && !target.fullyLoaded) {
                                target[of.key] = r.getValue(of.field) || '';
                            }
                        });
                    } catch (oe2) {
                        log.error('getEmployeeDetailsMap (' + of.field + ') Error', oe2.message);
                    }
                }
            });

            return map;
        };

        // 1 search for the whole page: all earning lines (type 'EARN') or deduction lines (type 'DED')
        const getComponentLinesMap = (payGroup, empIds, type) => {
            const map = {};
            if (!empIds || empIds.length === 0) return map;
            const isEarn = type === 'EARN';
            const joinId = isEarn ? 'custrecord_hris_employee_data_change' : 'custrecord_hris_employee_datachangeint';
            const compField = isEarn ? 'custrecord_hris_cde_payroll_component' : 'custrecord_hris_cdb_payroll_component';
            const monthlyField = isEarn ? 'custrecord_hris_cde_monthly' : 'custrecord_hris_cdb_monthly';
            try {
                const lineSearch = search.create({
                    type: CUSTOM_RECORDS.EMP_COMP_CHANGE,
                    filters: [
                        ['custrecord_hris_empchange_emp_pay_pro_gp', 'anyof', payGroup],
                        'AND',
                        ['custrecord_hris_empchange_employee_nam', 'anyof', empIds],
                        'AND',
                        ['isinactive', 'is', 'F']
                    ],
                    columns: [
                        search.createColumn({ name: 'custrecord_hris_empchange_employee_nam' }),
                        search.createColumn({ name: compField, join: joinId }),
                        search.createColumn({ name: monthlyField, join: joinId })
                    ]
                });
                runAllPaged(lineSearch, r => {
                    const empId = String(r.getValue({ name: 'custrecord_hris_empchange_employee_nam' }));
                    const component = r.getValue({ name: compField, join: joinId });
                    const monthly = parseFloat(r.getValue({ name: monthlyField, join: joinId }) || 0);
                    if (monthly > 0 && component) {
                        if (!map[empId]) map[empId] = [];
                        map[empId].push({
                            component: String(component),
                            componentText: r.getText({ name: compField, join: joinId }) || '',
                            monthly: monthly
                        });
                    }
                });
            } catch (e) {
                log.error('getComponentLinesMap Error (' + type + ')', e.message);
            }
            return map;
        };

        // 1 search for the whole page: payroll component name + social-security flag
        const getComponentInfoMap = (componentIds) => {
            const map = {};
            if (!componentIds || componentIds.length === 0) return map;
            try {
                chunkArray(componentIds, 500).forEach(chunk => {
                    const compSearch = search.create({
                        type: CUSTOM_RECORDS.PAYROLL_COMPONENT,
                        filters: [['internalid', 'anyof', chunk]],
                        columns: ['name', 'custrecord_hris_ss']
                    });
                    runAllPaged(compSearch, r => {
                        const ssVal = r.getValue('custrecord_hris_ss');
                        map[String(r.id)] = {
                            name: r.getValue('name') || '',
                            ss: (ssVal === true || ssVal === 'T')
                        };
                    });
                });
            } catch (e) {
                log.error('getComponentInfoMap Error', e.message);
            }
            return map;
        };

        // Same calculation as calculateEmployeePreview, but uses pre-fetched (batched) data - no searches / record loads inside
        const calculateEmployeePreviewBatch = (emp, earnLines, dedLines, compInfoMap, attData, salLines, loanLines, monthDays) => {
            let totalEarnings = 0;
            let totalDeductions = 0;
            let ssGross = 0;
            const earningsList = [];
            const deductionsList = [];

            try {
                const lopDays = attData ? attData.absentDays : 0;
                const workingDays = monthDays > 0 ? monthDays : 30;

                // 1. Compensation Change Earnings: Subject to LOP deduction prorating using absent/LOP days
                (earnLines || []).forEach(line => {
                    const info = compInfoMap[line.component];
                    let compName = line.componentText || 'Earning Component';
                    if (info) {
                        if (info.ss) {
                            ssGross += line.monthly;
                        }
                        compName = info.name || compName;
                    }
                    const proratedAmount = line.monthly - (workingDays > 0 ? (line.monthly / workingDays * lopDays) : 0);
                    totalEarnings += proratedAmount;
                    earningsList.push({ name: compName, amount: proratedAmount, component: line.component });
                });

                // 2. Monthly Salary Inputs (e.g. Employee Bonus, WOT, HOT, ROT): Display full amount without LOP deduction
                (salLines || []).forEach(line => {
                    const info = compInfoMap[line.component];
                    let compName = line.componentText || 'Monthly Salary Input';
                    if (info) {
                        compName = info.name || compName;
                    }
                    totalEarnings += line.amount;
                    earningsList.push({ name: compName, amount: line.amount, component: line.component });
                });

                // 3. Deduction Components
                (dedLines || []).forEach(line => {
                    const info = compInfoMap[line.component];
                    let dedName = line.componentText || 'Deduction Component';
                    if (info) {
                        dedName = info.name || dedName;
                    }
                    totalDeductions += line.monthly;
                    deductionsList.push({ name: dedName, amount: line.monthly, component: line.component });
                });

                // 4. Loan Deductions
                (loanLines || []).forEach(line => {
                    totalDeductions += line.amount;
                    deductionsList.push({ name: line.componentText, amount: line.amount, component: line.component });
                });
            } catch (e) {
                log.error('calculateEmployeePreviewBatch Error', e.message);
            }

            return {
                totalEarnings: totalEarnings,
                totalDeductions: totalDeductions,
                netPay: totalEarnings - totalDeductions,
                earningsList: earningsList,
                deductionsList: deductionsList,
                attendance: attData || { presentDays: 0, absentDays: 0 }
            };
        };

        const buildPagerHtml = (page, totalPages, totalCount, pageSize) => {
            const from = totalCount === 0 ? 0 : ((page - 1) * pageSize) + 1;
            const to = Math.min(page * pageSize, totalCount);

            let sizeOptions = '';
            PAGE_SIZE_OPTIONS.forEach(sz => {
                sizeOptions += `<option value="${sz}" ${sz === pageSize ? 'selected' : ''}>${sz} / page</option>`;
            });

            // page number buttons (window of 5 around the current page)
            let startP = Math.max(1, page - 2);
            let endP = Math.min(totalPages, startP + 4);
            startP = Math.max(1, endP - 4);
            let numBtns = '';
            for (let p = startP; p <= endP; p++) {
                numBtns += `<button type="button" class="pc-pg-btn ${p === page ? 'pc-pg-active' : ''}" onclick="pcGoPage(${p})">${p}</button>`;
            }

            return `
                <div class="pc-pager">
                    <div class="pc-pager-info">Showing ${from} - ${to} of ${totalCount} employees | Page ${page} of ${totalPages}</div>
                    <div class="pc-pager-ctrl">
                        <button type="button" class="pc-pg-btn" ${page <= 1 ? 'disabled' : ''} onclick="pcGoPage(1)">&laquo;</button>
                        <button type="button" class="pc-pg-btn" ${page <= 1 ? 'disabled' : ''} onclick="pcGoPage(${page - 1})">&lsaquo; Prev</button>
                        ${numBtns}
                        <button type="button" class="pc-pg-btn" ${page >= totalPages ? 'disabled' : ''} onclick="pcGoPage(${page + 1})">Next &rsaquo;</button>
                        <button type="button" class="pc-pg-btn" ${page >= totalPages ? 'disabled' : ''} onclick="pcGoPage(${totalPages})">&raquo;</button>
                        <select class="pc-pg-size" onchange="pcChangeSize(this.value)">
                            ${sizeOptions}
                        </select>
                    </div>
                </div>
            `;
        };

        const onRequest = (context) => {
            try {
                const request = context.request;
                const response = context.response;

                if (request.method === 'GET') {
                    const form = serverWidget.createForm({
                        title: 'Payroll Summary Verification Report (Read-Only)'
                    });

                    detailErrors = [];
                    const paramSubsidiary = request.parameters.custpage_subsidiary_filter || '';
                    const paramPayGroup = request.parameters.custpage_paygroup_filter || '';

                    // Pagination parameters
                    let pageSize = parseInt(request.parameters.custpage_pagesize, 10);
                    if (PAGE_SIZE_OPTIONS.indexOf(pageSize) === -1) pageSize = DEFAULT_PAGE_SIZE;
                    let currentPage = parseInt(request.parameters.custpage_page, 10);
                    if (!currentPage || currentPage < 1) currentPage = 1;

                    // Wage month / year / start date / end date are derived from the selected Pay Group (active wage period)
                    const activeWage = paramPayGroup ? getActiveWagePeriod(paramPayGroup) : null;
                    const paramWageMonth = activeWage ? activeWage.monthText : '';
                    const paramYear = activeWage ? String(activeWage.yearId || '') : '';

                    const subsList = getDropdownOptions('subsidiary');
                    const payGroups = getDropdownOptions(CUSTOM_RECORDS.PROCESS_GROUP);

                    let subsOptionsHTML = '<option value="">Select Subsidiary</option>';
                    let selectedSubFullName = '';
                    subsList.forEach(sub => {
                        const subParts = String(sub.name || '').split(':');
                        const subShortName = subParts[subParts.length - 1].trim() || sub.name;
                        const subIsSelected = paramSubsidiary === String(sub.id);
                        if (subIsSelected) selectedSubFullName = String(sub.name || '');
                        subsOptionsHTML += `<option value="${sub.id}" title="${String(sub.name || '').replace(/"/g, '&quot;')}" ${subIsSelected ? 'selected' : ''}>${subShortName}</option>`;
                    });

                    let payGroupOptionsHTML = '<option value="">Select Pay Group*</option>';
                    payGroups.forEach(pg => {
                        payGroupOptionsHTML += `<option value="${pg.id}" ${paramPayGroup === String(pg.id) ? 'selected' : ''}>${pg.name}</option>`;
                    });

                    const filterField = form.addField({
                        id: 'custpage_custom_filter_banner',
                        type: serverWidget.FieldType.INLINEHTML,
                        label: 'Filters'
                    });

                    let bannerHtml = `
                        <style>
                            .uir-page-title { display: none !important; }
                            .custom-filter-bar {
                                background-color: #1c365b !important;
                                border-bottom: 3px solid #1e90e6 !important;
                                padding: 14px 22px !important;
                                display: flex !important;
                                flex-direction: row !important;
                                align-items: center !important;
                                justify-content: space-between !important;
                                flex-wrap: wrap !important;
                                gap: 12px !important;
                                margin: 0 0 15px 0 !important;
                                box-sizing: border-box !important;
                                width: 100% !important;
                            }
                            .custom-filter-bar .filter-brand {
                                color: #ffffff !important;
                                font-size: 12px !important;
                                font-weight: bold !important;
                                font-family: Arial, sans-serif !important;
                                display: flex !important;
                                align-items: center !important;
                                gap: 6px !important;
                            }
                            .custom-filter-bar .filter-brand .brand-sep {
                                color: #8fa6c4 !important;
                                font-weight: normal !important;
                                margin: 0 4px !important;
                            }
                            .custom-filter-bar .filter-brand .brand-sub {
                                font-size: 10px !important;
                                font-weight: normal !important;
                                color: #d7e2f0 !important;
                            }
                            .custom-filter-bar .filter-group {
                                display: flex !important;
                                flex-direction: row !important;
                                align-items: center !important;
                                flex-wrap: wrap !important;
                                gap: 12px !important;
                            }
                            .filter-item {
                                display: flex !important;
                                flex-direction: column !important;
                                color: #ffffff !important;
                                font-size: 11px !important;
                                font-family: Arial, sans-serif !important;
                            }
                            .filter-item select {
                                width: 230px !important;
                                min-width: 230px !important;
                                max-width: 230px !important;
                                height: 32px !important;
                                padding: 4px 8px !important;
                                border-radius: 4px !important;
                                border: 1px solid #5f7ea8 !important;
                                font-size: 12px !important;
                                font-family: Arial, sans-serif !important;
                                background-color: #24446e !important;
                                color: #ffffff !important;
                                margin: 0 !important;
                            }
                            .filter-item select option {
                                background-color: #ffffff;
                                color: #222222;
                            }
                            .payroll-table { width: 100%; border-collapse: collapse; font-family: Arial, sans-serif; font-size: 12px; margin-top: 10px; background: #fff; }
                            .payroll-table th { background: #0b3c5d; color: #ffffff; text-align: left; padding: 10px; border: 1px solid #ddd; }
                            .payroll-table td { padding: 8px 10px; border: 1px solid #ddd; vertical-align: top; }
                            .payroll-table tr:nth-child(even) { background-color: #f9f9f9; }
                            .sub-table { width: 100%; border-collapse: collapse; margin: 2px 0; }
                            .sub-table td { border: none; padding: 2px 4px; font-size: 11px; }
                            .amount-col { text-align: right; font-weight: bold; }
                            .payroll-scroll { width: 100%; overflow-x: auto; }
                            .payroll-table th.num, .payroll-table td.num { text-align: right; white-space: nowrap; }
                            .payroll-table td.ded { color: #b3261e; }
                            .payroll-table td.zero { color: #9aa5b1; }
                            .pc-pager { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin: 10px 0; font-family: Arial, sans-serif; font-size: 12px; color: #1c365b; }
                            .pc-pager-info { font-weight: bold; }
                            .pc-pager-ctrl { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
                            .pc-pg-btn { background: #ffffff; color: #1c365b; border: 1px solid #1c365b; border-radius: 3px; height: 28px; min-width: 28px; padding: 0 8px; cursor: pointer; font-size: 12px; font-weight: bold; }
                            .pc-pg-btn:hover { background: #e4ecf6; }
                            .pc-pg-btn[disabled] { opacity: 0.4; cursor: default; }
                            .pc-pg-active { background: #1c365b; color: #ffffff; }
                            .pc-pg-size { height: 28px; margin-left: 8px; border: 1px solid #1c365b; border-radius: 3px; font-size: 12px; color: #1c365b; background: #fff; }
                        </style>
                        <script>
                            document.addEventListener('DOMContentLoaded', function() {
                                var subEl = document.getElementById('pcSubsidiary');
                                if (subEl) {
                                    subEl.value = "${paramSubsidiary}";
                                }
                            });
                            function pcNavigate(page, size, resetPage, customSubs) {
                                var subs = customSubs !== undefined ? customSubs : document.getElementById('pcSubsidiary').value;
                                var pg = document.getElementById('pcPayGroup').value;
                                var u = new URL(window.location.href);
                                u.searchParams.set('custpage_subsidiary_filter', subs);
                                u.searchParams.set('custpage_paygroup_filter', pg);
                                u.searchParams.delete('custpage_wagemonth_filter');
                                u.searchParams.delete('custpage_year_filter');
                                u.searchParams.set('custpage_page', resetPage ? '1' : String(page));
                                if (size) { u.searchParams.set('custpage_pagesize', String(size)); }
                                window.location.href = u.toString();
                            }
                            function pcGoPage(p) {
                                pcNavigate(p, '', false);
                            }
                            function pcChangeSize(sz) {
                                pcNavigate(1, sz, true);
                            }
                        </script>
                        <div class="custom-filter-bar">
                            <div class="filter-brand">
                                <span>&#9632;</span><span>Development HRMS</span>
                                <span class="brand-sep">|</span>
                                <span class="brand-sub">Payroll Summary Verification Report</span>
                            </div>
                            <div class="filter-group">
                                <div class="filter-item">
                                    <select name="custpage_subsidiary_filter" id="pcSubsidiary" autocomplete="off" title="${selectedSubFullName.replace(/"/g, '&quot;')}" onchange="pcNavigate(1, '', true, this.value)">
                                        ${subsOptionsHTML}
                                    </select>
                                </div>
                                <div class="filter-item">
                                    <select name="custpage_paygroup_filter" id="pcPayGroup" autocomplete="off" onchange="pcNavigate(1, '', true)">
                                        ${payGroupOptionsHTML}
                                    </select>
                                </div>
                            </div>
                        </div>
                    `;

                    if (paramPayGroup && paramWageMonth) {
                        const wagePeriodId = getWagePeriodNo(paramWageMonth);
                        const wagePeriodData = getWagePeriodYear(paramPayGroup, wagePeriodId);
                        const getYear = paramYear || wagePeriodData.yearId;
                        const monthDays = getMonthDays(paramWageMonth);

                        bannerHtml += `<div style="margin: 10px 0; font-weight: bold; font-family: Arial;">Wage Month: ${paramWageMonth} | Year: ${activeWage.yearText || wagePeriodData.yearText || 'N/A'} | Wage Period Start Date: ${wagePeriodData.startDate || activeWage.startDate || 'N/A'} | End Date: ${wagePeriodData.endDate || activeWage.endDate || 'N/A'}</div>`;

                        // ---- 1) all employee ids of the pay group (1 paged search) ----
                        const payGroupEmpIds = getEmployeeIdsForPayGroup(paramPayGroup, paramSubsidiary);
                        // only employees whose Monthly Attendance has Process Completed = true for this wage month / year
                        const processedSet = getProcessedEmployeeSet(wagePeriodId, getYear);
                        const allEmpIds = payGroupEmpIds.filter(id => processedSet[String(id)]);
                        const totalCount = allEmpIds.length;
                        const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
                        if (currentPage > totalPages) currentPage = totalPages;

                        // ---- 2) only the employees of the current page are processed ----
                        const pageStart = (currentPage - 1) * pageSize;
                        const pageEmpIds = allEmpIds.slice(pageStart, pageStart + pageSize);

                        // ---- 3) batched data for the page (searches in total, no record.load) ----
                        const empDetailsMap = getEmployeeDetailsMap(pageEmpIds);
                        const missingDetails = pageEmpIds.filter(id => !empDetailsMap[id] || (!empDetailsMap[id].empName && !empDetailsMap[id].subsidiaryText)).length;
                        if (missingDetails > 0 && detailErrors.length > 0) {
                            bannerHtml += `<div style="margin: 6px 0; padding: 6px 10px; background: #fff4e5; border: 1px solid #f0b86e; color: #7a4a00; font-family: Arial; font-size: 11px;">Employee details could not be read for ${missingDetails} employee(s): ${String(detailErrors[0]).replace(/</g, '&lt;')}</div>`;
                        }
                        const earnMap = getComponentLinesMap(paramPayGroup, pageEmpIds, 'EARN');
                        const dedMap = getComponentLinesMap(paramPayGroup, pageEmpIds, 'DED');
                        const attMap = getAttendanceDetailsMap(pageEmpIds, wagePeriodId, getYear);
                        const salInputMap = getMonthlySalInputMap(pageEmpIds, wagePeriodId, getYear, paramPayGroup, paramSubsidiary);
                        const loanMap = getLoanDeductionsMap(pageEmpIds, wagePeriodData.startDate || activeWage.startDate, wagePeriodData.endDate || activeWage.endDate);

                        const compIdSeen = {};
                        const compIds = [];
                        [earnMap, dedMap].forEach(m => {
                            Object.keys(m).forEach(k => {
                                m[k].forEach(line => {
                                    if (!compIdSeen[line.component]) {
                                        compIdSeen[line.component] = true;
                                        compIds.push(line.component);
                                    }
                                });
                            });
                        });
                        Object.keys(salInputMap).forEach(k => {
                            salInputMap[k].forEach(line => {
                                if (!compIdSeen[line.component]) {
                                    compIdSeen[line.component] = true;
                                    compIds.push(line.component);
                                }
                            });
                        });
                        Object.keys(loanMap).forEach(k => {
                            loanMap[k].forEach(line => {
                                if (!compIdSeen[line.component]) {
                                    compIdSeen[line.component] = true;
                                    compIds.push(line.component);
                                }
                            });
                        });
                        const compInfoMap = getComponentInfoMap(compIds);

                        const employees = pageEmpIds.map(id => {
                            const d = empDetailsMap[id] || {};
                            return {
                                empId: id,
                                empCode: d.empCode || '',
                                empName: d.empName || '',
                                subsidiary: d.subsidiary,
                                subsidiaryText: d.subsidiaryText || '',
                                ptApplicable: d.ptApplicable,
                                ptLoc: d.ptLoc,
                                socialInsApp: d.socialInsApp
                            };
                        });

                        const pagerHtml = buildPagerHtml(currentPage, totalPages, totalCount, pageSize);
                        bannerHtml += pagerHtml;

                        // ---- component columns (component master of the pay group, ordered by order seq no) ----
                        const masterCols = getPayrollComponentColumns(paramPayGroup);
                        const colList = [];
                        const colSeen = {};
                        masterCols.forEach(c => {
                            colSeen[c.id] = true;
                            colList.push({ id: c.id, name: c.name });
                        });
                        [earnMap, dedMap, salInputMap, loanMap].forEach(m => {
                            Object.keys(m).forEach(k => {
                                m[k].forEach(line => {
                                    if (!colSeen[line.component]) {
                                        colSeen[line.component] = true;
                                        const info = compInfoMap[line.component];
                                        colList.push({ id: line.component, name: (info && info.name) || line.componentText || 'Component' });
                                    }
                                });
                            });
                        });

                        // Pre-calculate employee previews to determine which components have values on the current page
                        const processedRows = [];
                        const activeComponentIds = {};

                        employees.forEach((emp, index) => {
                            const calc = calculateEmployeePreviewBatch(emp, earnMap[emp.empId], dedMap[emp.empId], compInfoMap, attMap[emp.empId], salInputMap[emp.empId], loanMap[emp.empId], monthDays);
                            const earnById = {};
                            const dedById = {};
                            calc.earningsList.forEach(e => {
                                earnById[e.component] = (earnById[e.component] || 0) + e.amount;
                                if (e.amount > 0) activeComponentIds[e.component] = true;
                            });
                            calc.deductionsList.forEach(d => {
                                dedById[d.component] = (dedById[d.component] || 0) + d.amount;
                                if (d.amount > 0) activeComponentIds[d.component] = true;
                            });

                            processedRows.push({
                                emp: emp,
                                calc: calc,
                                earnById: earnById,
                                dedById: dedById,
                                index: index
                            });
                        });

                        // Filter out components that do not have any values for the current page
                        const colListFiltered = colList.filter(c => activeComponentIds[c.id]);

                        const fmtCell = (n) => n.toLocaleString('en-IN', { minimumFractionDigits: 2 });
                        const totalCols = 3 + 2 + colListFiltered.length + 3;

                        bannerHtml += `<div class="payroll-scroll">`;
                        bannerHtml += `
                            <table class="payroll-table">
                               <thead>
                                    <tr>
                                        <th style="min-width: 40px;">SN</th>
                                        <th style="min-width: 160px;">Employee Info</th>
                                        <th style="min-width: 140px;">Subsidiary</th>
                                        <th class="num" style="min-width: 75px;">Present Days</th>
                                        <th class="num" style="min-width: 65px;">Absent Days</th>
                        `;
                        colListFiltered.forEach(c => {
                            bannerHtml += `<th class="num" style="min-width: 95px;">${c.name}</th>`;
                        });
                        bannerHtml += `
                                        <th class="num" style="min-width: 105px;">Total Earnings</th>
                                        <th class="num" style="min-width: 105px;">Total Deductions</th>
                                        <th class="num" style="min-width: 110px;">Net Pay (₹)</th>
                                    </tr>
                               </thead>
                               <tbody>
                        `;

                        if (processedRows.length === 0) {
                            const emptyMsg = detailErrors.length > 0
                                ? 'No employees found. ' + String(detailErrors[0]).replace(/</g, '&lt;')
                                : 'No employees with Process Completed attendance found for the selected Pay Group / wage month.';
                            bannerHtml += `<tr><td colspan="${totalCols}" style="text-align: center; padding: 20px;">${emptyMsg}</td></tr>`;
                        } else {
                            processedRows.forEach((rowObj) => {
                                const emp = rowObj.emp;
                                const calc = rowObj.calc;
                                const earnById = rowObj.earnById;
                                const dedById = rowObj.dedById;
                                const index = rowObj.index;
                                const att = calc.attendance;

                                let rowHtml = `
                                    <tr>
                                        <td>${pageStart + index + 1}</td>
                                        <td><b>${emp.empCode}</b><br/>${emp.empName}</td>
                                        <td>${emp.subsidiaryText}</td>
                                        <td class="num">${att.presentDays}</td>
                                        <td class="num" style="color: #b3261e;">${att.absentDays}</td>
                                `;
                                colListFiltered.forEach(c => {
                                    const earnAmt = earnById[c.id] || 0;
                                    const dedAmt = dedById[c.id] || 0;
                                    if (!earnAmt && !dedAmt) {
                                        rowHtml += `<td class="num zero">-</td>`;
                                    } else if (dedAmt && !earnAmt) {
                                        rowHtml += `<td class="num ded">${fmtCell(dedAmt)}</td>`;
                                    } else {
                                        rowHtml += `<td class="num">${fmtCell(earnAmt)}</td>`;
                                    }
                                });
                                rowHtml += `
                                        <td class="num" style="font-weight: bold;">${fmtCell(calc.totalEarnings)}</td>
                                        <td class="num ded" style="font-weight: bold;">${fmtCell(calc.totalDeductions)}</td>
                                        <td class="num" style="font-weight: bold; color: #0b3c5d;">${fmtCell(calc.netPay)}</td>
                                    </tr>
                                `;
                                bannerHtml += rowHtml;
                            });
                        }

                        bannerHtml += `
                               </tbody>
                            </table>
                        `;
                        bannerHtml += `</div>`;

                        bannerHtml += pagerHtml;
                    } else if (paramPayGroup && !paramWageMonth) {
                        bannerHtml += `<div style="text-align: center; padding: 40px; color: #666; font-family: Arial; font-size: 14px;">No active wage period found for the selected Pay Group.</div>`;
                    } else {
                        bannerHtml += `<div style="text-align: center; padding: 40px; color: #666; font-family: Arial; font-size: 14px;">Select Pay Group to load the Payroll Summary Verification Report.</div>`;
                    }

                    filterField.defaultValue = bannerHtml;
                    response.writePage(form);
                } else {
                    const subsidiary = request.parameters.custpage_subsidiary_filter;
                    const payGroup = request.parameters.custpage_paygroup_filter;

                    const currentScript = runtime.getCurrentScript();

                    redirect.toSuitelet({
                        scriptId: currentScript.id,
                        deploymentId: currentScript.deploymentId,
                        parameters: {
                            custpage_subsidiary_filter: subsidiary || '',
                            custpage_paygroup_filter: payGroup || ''
                        }
                    });
                }
            } catch (e) {
                log.error('Suitelet onRequest Error', e.message);
            }
        };

        return {
            onRequest
        };
    });