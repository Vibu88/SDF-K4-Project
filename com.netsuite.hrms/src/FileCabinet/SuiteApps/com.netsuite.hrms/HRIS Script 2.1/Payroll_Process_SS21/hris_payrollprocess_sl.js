/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope Public
 */
define(['N/log', 'N/search', 'N/record', 'N/runtime', 'N/ui/serverWidget', 'N/query', 'N/redirect'],
    (log, search, record, runtime, serverWidget, query, redirect) => {

        const onRequest = (context) => {
            const request = context.request;
            const response = context.response;
            const parameters = request.parameters;
            const curUser = runtime.getCurrentUser();
            const curRole = curUser.role;

            // Role / user validation (currently commented out)
            /*
            if ((curRole === '3' && (curUser.id === '329740' || curUser.id === '329739' || curUser.id === '329738')) ||
                (curRole === '1104' || curRole === '1105' || curUser.id === '466163')) {
                // allowed
            } else {
                throw 'You do not have privilege to access this page!';
            }
            */

            let b_Flag = request.parameters.custscript_flag_postmethod;
            log.debug('b_Flag', b_Flag);

            if (!_logValidation(b_Flag)) {
                b_Flag = false;
            }

            log.debug('b_Flag', b_Flag);
            log.debug('Request Method', request.method);

            if (b_Flag === false) {
                if (request.method === 'GET') {
                    //***** GET Method *****
                    const form = serverWidget.createForm({
                        title: 'Pay Process'
                    });
                    form.clientScriptModulePath = './payprocess subsidiary validation cs.js';

                    const currentUser = runtime.getCurrentUser();
                    const userRoleId = currentUser.role;

                    const roleSearchObj = search.create({
                        type: 'role',
                        filters: [['internalid', 'anyof', userRoleId]],
                        columns: [
                            search.createColumn({ name: 'subsidiaries', label: 'Accessible Subsidiaries' })
                        ]
                    });

                    const searchResult = roleSearchObj.run().getRange({ start: 0, end: 1000 });
                    const accessibleSubsidiaries = [];

                    for (let i = 0; i < searchResult.length; i++) {
                        const subsidiaryId = searchResult[i].getValue({ name: 'subsidiaries' });
                        const subsidiaryText = searchResult[i].getText({ name: 'subsidiaries' });

                        if (subsidiaryId && accessibleSubsidiaries.findIndex(s => s.id === subsidiaryId) === -1) {
                            accessibleSubsidiaries.push({
                                id: subsidiaryId,
                                name: subsidiaryText
                            });
                        }
                    }

                    const subsidiary = form.addField({
                        id: 'custscript_subsidiary',
                        type: serverWidget.FieldType.SELECT,
                        label: 'Subsidiary'
                    });
                    subsidiary.isMandatory = true;
                    subsidiary.addSelectOption({
                        value: '',
                        text: '--Select Subsidiary--'
                    });

                    for (let k = 0; k < accessibleSubsidiaries.length; k++) {
                        subsidiary.addSelectOption({
                            value: accessibleSubsidiaries[k].id,
                            text: accessibleSubsidiaries[k].name
                        });
                    }

                    const paygrpName = form.addField({
                        id: 'custscript_paygroup',
                        type: serverWidget.FieldType.SELECT,
                        label: 'Pay group'
                    });
                    paygrpName.isMandatory = true;

                    // Department Field (hidden)
                    const department = form.addField({
                        id: 'custscript_department',
                        type: serverWidget.FieldType.SELECT,
                        label: 'Department',
                        source: 'customrecord_cseg_hris_empdept'
                    });
                    department.updateDisplayType({
                        displayType: serverWidget.FieldDisplayType.HIDDEN
                    });

                    // Populate Pay Group options based on accessible subsidiaries
                    if (accessibleSubsidiaries.length > 0) {
                        const placeholders = accessibleSubsidiaries.map(() => '?').join(',');
                        let sqlPaygrp = '';
                        sqlPaygrp += 'SELECT id, name ';
                        sqlPaygrp += 'FROM customrecord_hris_process_groupmaster ';
                        sqlPaygrp += `WHERE custrecord_hris__subsidiary IN (${placeholders}) `;
                        sqlPaygrp += "AND isinactive = 'F'";

                        const subsidiaryIds = accessibleSubsidiaries.map(sub => sub.id);

                        const paygrpQueryResult = query.runSuiteQL({
                            query: sqlPaygrp,
                            params: subsidiaryIds
                        });
                        const paygrpResult = paygrpQueryResult.asMappedResults();

                        paygrpName.addSelectOption({
                            value: '',
                            text: ''
                        });

                        paygrpResult.forEach(row => {
                            paygrpName.addSelectOption({
                                value: row.id,
                                text: row.name
                            });
                        });
                    }

                    form.addSubmitButton({
                        label: 'Get Data'
                    });

                    response.writePage(form);

                } else if (request.method === 'POST') {
                    //***** POST Method *****
                    const param = {};
                    const scriptObj = request.parameters;

                    const payGroup = scriptObj.custscript_paygroup;
                    const Subsidiary = scriptObj.custscript_subsidiary;
                    const department = scriptObj.custscript_department;

                    log.debug('POST payGroup', payGroup);

                    const PayfreqSeqNo = getPayfrequency(payGroup);
                    log.debug('POST PayfreqSeqNo', PayfreqSeqNo);

                    // Delete Pre Pay Process Records
                    let sqlPrepayprocess = 'SELECT * FROM customrecord_hris_pre_pay_process_record ';
                    if (_logValidation(payGroup)) {
                        sqlPrepayprocess += ` WHERE custrecord_hris_pre_pay_pr_pay_group = ${payGroup}`;
                    }
                    if (_logValidation(Subsidiary)) {
                        sqlPrepayprocess += ` AND custrecord_hris_pre_pay_pr_subsidiary = ${Subsidiary}`;
                    }
                    if (_logValidation(department)) {
                        sqlPrepayprocess += ` AND custrecord_hris_pre_pay_procc_department = ${department}`;
                    }

                    log.emergency('sqlPrepayprocess', sqlPrepayprocess);

                    const PrepayprocessResult = query.runSuiteQL({ query: sqlPrepayprocess });
                    const PrepayprocessRes = PrepayprocessResult.asMappedResults();

                    if (PrepayprocessRes.length > 0) {
                        if (PrepayprocessRes.length > 240) {
                            for (let loop = 0; loop < 240; loop++) {
                                const Prepayprocessrow = PrepayprocessRes[loop];
                                const i_PayGroupId = Prepayprocessrow.id;
                                log.emergency('i_PayGroupId', i_PayGroupId);

                                record.delete({
                                    type: 'customrecord_hris_pre_pay_process_record',
                                    id: i_PayGroupId
                                });

                                const usageRemained = runtime.getCurrentScript().getRemainingUsage();
                                log.debug('usage_Remained', usageRemained);
                            }

                            b_Flag = true;
                            param.custscript_counter_delete = 2;
                            param.custscript_pay_group = payGroup;
                            param.custscript_flag_postmethod = b_Flag;
                            param.custscript_hris_subsidiary = Subsidiary;
                            param.custscript_department = department;

                            redirect.toSuitelet({
                                scriptId: 'customscript_hris_payrollprocess_sl',
                                deploymentId: 'customdeploy_hris_payrollprocess_sl',
                                isExternal: false,
                                parameters: param
                            });

                        } else {
                            for (let loop = 0; loop < PrepayprocessRes.length; loop++) {
                                const Prepayprocessrow = PrepayprocessRes[loop];
                                const i_PayGroupId = Prepayprocessrow.id;

                                record.delete({
                                    type: 'customrecord_hris_pre_pay_process_record',
                                    id: i_PayGroupId
                                });

                                const usageRemained = runtime.getCurrentScript().getRemainingUsage();
                                log.debug('usage_Remained', usageRemained);
                            }

                            // Get Wage Period
                            const wagedetails = getWagePeriod(payGroup);
                            let wageMonth = '';
                            let wageMonthTxt = '';
                            let Year = '';
                            let period = '';

                            if (wagedetails.length > 0) {
                                for (const wagedet of wagedetails) {
                                    wageMonth = wagedet.wagemonth;
                                    log.debug('wageMonth', wageMonth);
                                    wageMonthTxt = wagedet.wagemonthname;
                                    log.debug('wageMonthTxt', wageMonthTxt);
                                    Year = wagedet.wageyear;
                                    log.debug('Year', Year);
                                    period = wagedet.wageenddate;
                                    log.debug('period', period);
                                }
                            }

                            log.debug('wagedetails', `${wageMonth}#${wageMonthTxt}#${Year}#${period}`);

                            const Emp_count = getEmployee(payGroup, period, Subsidiary, wageMonth, Year, department);
                            log.debug('GET', `Emp_count${Emp_count}`);

                            param.custscript_paygroup = payGroup;
                            param.custscript_wagemonth = wageMonth;
                            param.custscript_wagemonthtxt = wageMonthTxt;
                            param.custscript_emp_count = Emp_count;
                            param.custscript_emp_year = Year;
                            param.custscript_emp_period = period;
                            param.custscript_payfreq_seq = PayfreqSeqNo;
                            param.custscript_hris_subsidiary = Subsidiary;
                            param.custscript_department = department;

                            redirect.toSuitelet({
                                scriptId: 'customscript_hris_payrollprocesssec_sl',
                                deploymentId: 'customdeploy_hris_payrollprocesssec_sl',
                                parameters: param
                            });
                        }
                    } else {
                        // No pre-pay records – proceed directly
                        const wagedetails = getWagePeriod(payGroup);
                        let wageMonth = '';
                        let wageMonthTxt = '';
                        let Year = '';
                        let period = '';

                        if (wagedetails.length > 0) {
                            for (const wagedet of wagedetails) {
                                wageMonth = wagedet.wagemonth;
                                log.debug('wageMonth', wageMonth);
                                wageMonthTxt = wagedet.wagemonthname;
                                Year = wagedet.wageyear;
                                period = wagedet.wageenddate;
                            }
                        }

                        log.debug('wagedetails', `${wageMonth}#${wageMonthTxt}#${Year}#${period}`);

                        const Emp_count = getEmployee(payGroup, period, Subsidiary, wageMonth, Year, department);
                        log.debug('GET', `Emp_count${Emp_count}`);

                        param.custscript_paygroup = payGroup;
                        param.custscript_wagemonth = wageMonth;
                        param.custscript_wagemonthtxt = wageMonthTxt;
                        param.custscript_emp_count = Emp_count;
                        param.custscript_emp_year = Year;
                        param.custscript_emp_period = period;
                        param.custscript_payfreq_seq = PayfreqSeqNo;
                        param.custscript_hris_subsidiary = Subsidiary;
                        param.custscript_department = department;

                        redirect.toSuitelet({
                            scriptId: 'customscript_hris_payrollprocesssec_sl',
                            deploymentId: 'customdeploy_hris_payrollprocesssec_sl',
                            parameters: param
                        });
                    }
                }
            } else if (b_Flag === true) {
                // Continuation of large delete (governance chunking)
                log.debug('Request Method', ` ${context.request.method}`);

                const param = {};
                const payGroup = context.request.parameters.custscript_pay_group;
                log.debug('payGroup ', payGroup);

                let i_Counter = context.request.parameters.custscript_counter_delete;
                log.debug('i_Counter ', i_Counter);

                const Subsidiary = context.request.parameters.custscript_hris_subsidiary;
                log.audit('subsidiary', Subsidiary);

                const department = context.request.parameters.custscript_department;

                let sqlPrepayprocess = 'SELECT * FROM customrecord_hris_pre_pay_process_record ';
                if (_logValidation(payGroup)) {
                    sqlPrepayprocess += ` WHERE custrecord_hris_pre_pay_pr_pay_group = ${payGroup}`;
                }
                if (_logValidation(Subsidiary)) {
                    sqlPrepayprocess += ` AND custrecord_hris_pre_pay_pr_subsidiary = ${Subsidiary}`;
                }
                if (_logValidation(department)) {
                    sqlPrepayprocess += ` AND custrecord_hris_pre_pay_procc_department = ${department}`;
                }

                log.audit('SqlPrepayprocess', sqlPrepayprocess);

                const PrepayprocessResult = query.runSuiteQL({ query: sqlPrepayprocess });
                const PrepayprocessRes = PrepayprocessResult.asMappedResults();

                if (PrepayprocessRes.length > 0) {
                    if (PrepayprocessRes.length > 240) {
                        for (let loop = 0; loop < 240; loop++) {
                            const Prepayprocessrow = PrepayprocessRes[loop];
                            const i_PayGroupId = Prepayprocessrow.id;
                            log.debug('Paygroup id ', i_PayGroupId);

                            record.delete({
                                type: 'customrecord_hris_pre_pay_process_record',
                                id: i_PayGroupId
                            });

                            const usageRemained = runtime.getCurrentScript().getRemainingUsage();
                            log.debug('usage_Remained', usageRemained);
                        }

                        i_Counter++;
                        if (i_Counter < 5) {
                            const redirectParam = {
                                custscript_counter_delete: i_Counter,
                                custscript_pay_group: payGroup,
                                custscript_flag_postmethod: b_Flag,
                                custscript_hris_subsidiary: Subsidiary,
                                custscript_department: department
                            };

                            redirect.toSuitelet({
                                scriptId: 'customscript_hris_payprocess_sl',
                                deploymentId: `customdeploy_hris_payprocess_sl${i_Counter}`,
                                isExternal: false,
                                parameters: redirectParam
                            });
                        } else {
                            // Max chunks reached – finish processing
                            const wagedetails = getWagePeriod(payGroup);
                            let wageMonth = '';
                            let wageMonthTxt = '';
                            let Year = '';
                            let period = '';

                            if (wagedetails.length > 0) {
                                for (const wagedet of wagedetails) {
                                    wageMonth = wagedet.wagemonth;
                                    log.debug('wageMonth', wageMonth);
                                    wageMonthTxt = wagedet.wagemonthname;
                                    Year = wagedet.wageyear;
                                    period = wagedet.wageenddate;
                                }
                            }

                            log.debug('wagedetails', `${wageMonth}#${wageMonthTxt}#${Year}#${period}`);

                            const Emp_count = getEmployee(payGroup, period, Subsidiary, wageMonth, Year, department);
                            log.debug('GET', `Emp_count${Emp_count}`);

                            const PayfreqSeqNo = getPayfrequency(payGroup);

                            param.custscript_paygroup = payGroup;
                            param.custscript_wagemonth = wageMonth;
                            param.custscript_wagemonthtxt = wageMonthTxt;
                            param.custscript_emp_count = Emp_count;
                            param.custscript_emp_year = Year;
                            param.custscript_emp_period = period;
                            param.custscript_payfreq_seq = PayfreqSeqNo;
                            param.custscript_hris_subsidiary = Subsidiary;
                            param.custscript_department = department;

                            redirect.toSuitelet({
                                scriptId: 'customscript_hris_payrollprocesssec_sl',
                                deploymentId: 'customdeploy_hris_payrollprocesssec_sl',
                                parameters: param
                            });
                        }
                    } else {
                        // Remaining records ≤ 240 – delete them all
                        for (let loop = 0; loop < PrepayprocessRes.length; loop++) {
                            const Prepayprocessrow = PrepayprocessRes[loop];
                            const i_PayGroupId = Prepayprocessrow.id;

                            record.delete({
                                type: 'customrecord_hris_pre_pay_process_record',
                                id: i_PayGroupId
                            });

                            const usageRemained = runtime.getCurrentScript().getRemainingUsage();
                            log.debug('usage_Remained', usageRemained);
                        }

                        const wagedetails = getWagePeriod(payGroup);
                        let wageMonth = '';
                        let wageMonthTxt = '';
                        let Year = '';
                        let period = '';

                        if (wagedetails.length > 0) {
                            for (const wagedet of wagedetails) {
                                wageMonth = wagedet.wagemonth;
                                log.debug('wageMonth', wageMonth);
                                wageMonthTxt = wagedet.wagemonthname;
                                Year = wagedet.wageyear;
                                period = wagedet.wageenddate;
                            }
                        }

                        log.debug('wagedetails', `${wageMonth}#${wageMonthTxt}#${Year}#${period}`);

                        const Emp_count = getEmployee(payGroup, period, Subsidiary, wageMonth, Year, department);
                        log.debug('GET', `Emp_count${Emp_count}`);

                        const PayfreqSeqNo = getPayfrequency(payGroup);

                        param.custscript_paygroup = payGroup;
                        param.custscript_wagemonth = wageMonth;
                        param.custscript_wagemonthtxt = wageMonthTxt;
                        param.custscript_emp_count = Emp_count;
                        param.custscript_emp_year = Year;
                        param.custscript_emp_period = period;
                        param.custscript_payfreq_seq = PayfreqSeqNo;
                        param.custscript_hris_subsidiary = Subsidiary;
                        param.custscript_department = department;

                        redirect.toSuitelet({
                            scriptId: 'customscript_hris_payrollprocesssec_sl',
                            deploymentId: 'customdeploy_hris_payrollprocesssec_sl',
                            parameters: param
                        });
                    }
                } else {
                    // No more records left
                    const wagedetails = getWagePeriod(payGroup);
                    let wageMonth = '';
                    let wageMonthTxt = '';
                    let Year = '';
                    let period = '';

                    if (wagedetails.length > 0) {
                        for (const wagedet of wagedetails) {
                            wageMonth = wagedet.wagemonth;
                            log.debug('wageMonth', wageMonth);
                            wageMonthTxt = wagedet.wagemonthname;
                            Year = wagedet.wageyear;
                            period = wagedet.wageenddate;
                        }
                    }

                    log.debug('wagedetails', `${wageMonth}#${wageMonthTxt}#${Year}#${period}`);

                    const Emp_count = getEmployee(payGroup, period, Subsidiary, wageMonth, Year, department);
                    log.debug('GET', `Emp_count${Emp_count}`);

                    const PayfreqSeqNo = getPayfrequency(payGroup);

                    param.custscript_paygroup = payGroup;
                    param.custscript_wagemonth = wageMonth;
                    param.custscript_wagemonthtxt = wageMonthTxt;
                    param.custscript_emp_count = Emp_count;
                    param.custscript_emp_year = Year;
                    param.custscript_emp_period = period;
                    param.custscript_payfreq_seq = PayfreqSeqNo;
                    param.custscript_hris_subsidiary = Subsidiary;
                    param.custscript_department = department;

                    redirect.toSuitelet({
                        scriptId: 'customscript_hris_payrollprocesssec_sl',
                        deploymentId: 'customdeploy_hris_payrollprocesssec_sl',
                        parameters: param
                    });
                }
            }
        };

        const getWagePeriod = (paygrpName) => {
            const sqlwage = `SELECT b.name AS wagemonthname,
                                    A.custrecord_hris_month AS wagemonth,
                                    c.name AS wageyear,
                                    A.custrecord_hris_year AS wageyear1,
                                    A.custrecord_hris_end_date AS wageenddate
                             FROM customrecord_hris_wage_period_details A
                             INNER JOIN customlist_hris_month_list b ON b.id = A.custrecord_hris_month
                             INNER JOIN customlist_hris_year_master c ON A.custrecord_hris_year = c.id
                             WHERE A.isinactive = 'F'
                               AND A.custrecord_hris_pay_group = ${paygrpName}`;

            log.debug('sqlwage', sqlwage);

            const queryRes = query.runSuiteQL({ query: sqlwage });
            const wageResult = queryRes.asMappedResults();

            log.debug('wageResult', wageResult);
            return wageResult;
        };

        const getEmployee = (paygrpName, period, Subsidiary, wageMonth, Year, department) => {
            log.debug('getEmployee', `${paygrpName} - ${period}`);

            let Count = 0;

            // Updated query (28/09/2026) – supports freelance / outsource employees
            let sqlemp = `SELECT a.custrecord_hris_empchange_employee_nam,
                                 MAX(custrecord_hris_empchange_increment_eff),
                                 a.custrecord_hris_empchange_emp_pay_pro_gp,
                                 a.custrecord_hris_empchange_date_of_join
                          FROM customrecord_hris_employee_compen_change a
                          INNER JOIN employee b ON b.id = a.custrecord_hris_empchange_employee_nam
                          LEFT JOIN customrecord_hrms_monthlyattendance m
                                 ON a.custrecord_hris_empchange_employee_nam = m.custrecord_hrms_month_empid
                          INNER JOIN customrecord_hris_employeecategory c
                                 ON b.custentity_hris_empcategory = c.id
                          WHERE a.custrecord_hris_empchange_emp_active_sts = 1
                            AND a.custrecord_hris_empchange_emp_pay_pro_gp = ${paygrpName}
                            AND a.custrecord_hris_empchange_subsidiary = ${Subsidiary}
                            AND b.isinactive = 'F'
                            AND (
                                  (
                                      b.custentity_hris_empispayroll = 'T'
                                      AND b.custentity_hris_empistimesheetapplicable = 'T'
                                      AND m.custrecord_hrms_month_monthid = ${wageMonth}
                                      AND BUILTIN.DF(m.custrecord_hrms_month_yearid) = '${Year}'
                                      AND m.custrecord_hrms_month_paygroup = ${paygrpName}
                                  )
                                  OR
                                  (
                                      b.custentity_hris_empispayroll = 'T'
                                      AND c.custrecord_hris_empcat_seqno = 4
                                  )
                                )`;

            if (department) {
                sqlemp += ` AND b.custentity_hris_empdepartment_new = ${department}`;
            }

            sqlemp += ` GROUP BY a.custrecord_hris_empchange_employee_nam,
                                 a.custrecord_hris_empchange_emp_pay_pro_gp,
                                 a.custrecord_hris_empchange_date_of_join`;

            log.debug('Final Employee Query', sqlemp);

            const queryRes = query.runSuiteQL({ query: sqlemp });
            const empResult = queryRes.asMappedResults();

            if (empResult.length > 0) {
                for (const emprow of empResult) {
                    const doj = emprow.custrecord_hris_empchange_date_of_join;
                    if (period >= doj) {
                        Count++;
                    }
                }
            }

            log.debug('getEmployee : Count', Count);
            return Count;
        };

        const getPayfrequency = (paygrpid) => {
            let SeqNo = 0;

            const sqlPayfrq = `SELECT A.name AS processgrpname,
                                      b.name AS payfrequency,
                                      A.custrecord_hris__currency AS processcurrency,
                                      custrecord_hris__sequence_no AS freqseqno
                               FROM customrecord_hris_process_groupmaster A
                               INNER JOIN customrecord_hris_pay_process_frequency B
                                      ON A.custrecord_hris_pay_process_frequency = B.id
                               WHERE A.id = ${paygrpid}`;

            log.debug('sqlPayfrq', sqlPayfrq);

            const PayfrqQueryResult = query.runSuiteQL({ query: sqlPayfrq });
            const PayfrqResult = PayfrqQueryResult.asMappedResults();

            if (PayfrqResult.length > 0) {
                for (const paygrprow of PayfrqResult) {
                    SeqNo = paygrprow.freqseqno;
                }
            }

            log.audit('Payseqno', SeqNo);
            return SeqNo;
        };

        const searchPayFrq = (payfreq) => {
            // Placeholder – add logic if needed
        };

        const _logValidation = (value) => {
            return (value !== 'null' && value !== null && value !== '' &&
                    value !== undefined && value !== 'undefined' && !isNaN(value));
        };

        return {
            onRequest
        };
    });