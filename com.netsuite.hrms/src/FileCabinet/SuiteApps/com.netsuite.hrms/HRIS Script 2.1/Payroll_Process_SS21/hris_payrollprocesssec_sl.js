/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope Public
 */
define(['N/log', 'N/search', 'N/record', 'N/runtime', 'N/ui/serverWidget', 'N/query', 'N/redirect', 'N/task', 'N/url', 'N/email'],
    (log, search, record, runtime, serverWidget, query, redirect, task, url, email) => {

        const onRequest = (context) => {
            if (context.request.method === 'GET') {
                const WagePeriod = context.request.parameters.custscript_wagemonth;
                const WagePeriodtxt = context.request.parameters.custscript_wagemonthtxt;
                const WageYear = context.request.parameters.custscript_emp_year;
                const WagePeriodNew = context.request.parameters.custscript_emp_period;
                const Paygrp = context.request.parameters.custscript_paygroup;
                const Subsidiary = context.request.parameters.custscript_hris_subsidiary;
                const department = context.request.parameters.custscript_department;
                // const employeeCat = context.request.parameters.custscript_employee_category;

                log.debug('context', `Paygrp......${Paygrp}`);
                log.debug('context', `WagePeriod........${WagePeriod}`);
                log.debug('context', `WagePeriodtxt........${WagePeriodtxt}`);
                log.debug('context', `WageYear........####${WageYear}`);
                log.debug('context', `WagePeriodNew........*************${WagePeriodNew}`);
                log.debug('context', `Subsidiary${Subsidiary}`);
                log.debug('context', `Department${department}`);
                // log.debug('context', `Employee Category${employeeCat}`);

                const Emp_List = serverWidget.createForm({
                    title: 'Pay Process'
                });

                // Pay Group (disabled)
                const emp_Paygrp = Emp_List.addField({
                    id: 'custpage_paygroup',
                    type: serverWidget.FieldType.SELECT,
                    label: 'Pay Group',
                    source: 'customrecord_hris_process_groupmaster'
                });
                emp_Paygrp.updateDisplayType({
                    displayType: serverWidget.FieldDisplayType.DISABLED
                });
                emp_Paygrp.defaultValue = Paygrp;

                // Subsidiary (disabled)
                const subsidiary = Emp_List.addField({
                    id: 'custpage_subsidiary',
                    type: serverWidget.FieldType.SELECT,
                    label: 'Subsidiary',
                    source: 'subsidiary'
                });
                subsidiary.updateDisplayType({
                    displayType: serverWidget.FieldDisplayType.DISABLED
                });
                subsidiary.defaultValue = Subsidiary;

                // Department (disabled display)
                const departmentFld = Emp_List.addField({
                    id: 'custpage_department_display',
                    type: serverWidget.FieldType.SELECT,
                    label: 'Department',
                    source: 'customrecord_cseg_hris_empdept'
                }).updateDisplayType({
                    displayType: serverWidget.FieldDisplayType.DISABLED
                });
                departmentFld.defaultValue = department;

                // Employee Category (commented out)
                /*
                const employeeCatFld = Emp_List.addField({
                    id: 'custpage_employeecat_display',
                    type: serverWidget.FieldType.SELECT,
                    label: 'Employee Category',
                    source: 'customrecord_hris_employeecategory'
                }).updateDisplayType({
                    displayType: serverWidget.FieldDisplayType.DISABLED
                });
                employeeCatFld.defaultValue = employeeCat;
                */

                // Pay Date
                const Pay_Date = Emp_List.addField({
                    id: 'custpage_paydate',
                    type: serverWidget.FieldType.DATE,
                    label: 'Pay Date'
                });
                Pay_Date.updateDisplayType({
                    displayType: serverWidget.FieldDisplayType.DISABLED
                });
                Pay_Date.defaultValue = WagePeriodNew;

                // Pay Month
                const wage_Period = Emp_List.addField({
                    id: 'custpage_wageperiod',
                    type: serverWidget.FieldType.TEXT,
                    label: 'Pay Month'
                });
                wage_Period.updateDisplayType({
                    displayType: serverWidget.FieldDisplayType.DISABLED
                });
                wage_Period.defaultValue = WagePeriodtxt;

                // Year
                const wage_Year = Emp_List.addField({
                    id: 'custpage_wageyr',
                    type: serverWidget.FieldType.TEXT,
                    label: 'Year'
                });
                wage_Year.updateDisplayType({
                    displayType: serverWidget.FieldDisplayType.DISABLED
                });
                wage_Year.defaultValue = WageYear;

                // Employee Count
                const Employee_count = Emp_List.addField({
                    id: 'custscript_counter',
                    type: serverWidget.FieldType.TEXT,
                    label: 'Employee count'
                });
                Employee_count.updateDisplayType({
                    displayType: serverWidget.FieldDisplayType.DISABLED
                });
                Employee_count.defaultValue = context.request.parameters.custscript_emp_count;

                // Pay Frequency
                const pay_freq = Emp_List.addField({
                    id: 'custpage_payfrq',
                    type: serverWidget.FieldType.TEXT,
                    label: 'Pay Freq'
                });
                pay_freq.updateDisplayType({
                    displayType: serverWidget.FieldDisplayType.DISABLED
                });
                pay_freq.defaultValue = context.request.parameters.custscript_payfreq_seq;

                // Hidden fields to carry filters to POST
                Emp_List.addField({
                    id: 'custpage_department',
                    type: serverWidget.FieldType.TEXT,
                    label: 'Department ID'
                }).updateDisplayType({
                    displayType: serverWidget.FieldDisplayType.HIDDEN
                }).defaultValue = department;

                /*
                Emp_List.addField({
                    id: 'custpage_employeecat',
                    type: serverWidget.FieldType.TEXT,
                    label: 'Employee Category ID'
                }).updateDisplayType({
                    displayType: serverWidget.FieldDisplayType.HIDDEN
                }).defaultValue = employeeCat;
                */

                // Sublist
                const emp_sublist = Emp_List.addSublist({
                    id: 'custpage_apm_employee_sublist',
                    type: serverWidget.SublistType.LIST,
                    label: 'Employee List'
                });

                const sno_field = emp_sublist.addField({
                    id: 'custpage_sno',
                    type: serverWidget.FieldType.FLOAT,
                    label: 'S.No'
                });
                sno_field.updateDisplayType({
                    displayType: serverWidget.FieldDisplayType.NORMAL
                });

                emp_sublist.addMarkAllButtons();

                const chk_box = emp_sublist.addField({
                    id: 'custscript_apm_check',
                    type: serverWidget.FieldType.CHECKBOX,
                    label: 'Checkbox'
                });
                chk_box.defaultValue = 'T';

                emp_sublist.addField({
                    id: 'custpage_empcode',
                    type: serverWidget.FieldType.TEXT,
                    label: 'Employee code'
                });

                emp_sublist.addField({
                    id: 'custpage_em',
                    type: serverWidget.FieldType.TEXT,
                    label: 'Employee Name'
                });

                const emplid = emp_sublist.addField({
                    id: 'custpage_empid',
                    type: serverWidget.FieldType.FLOAT,
                    label: 'Employee ID'
                });
                emplid.updateDisplayType({
                    displayType: serverWidget.FieldDisplayType.HIDDEN
                });

                const paygrpid = emp_sublist.addField({
                    id: 'custpage_paygrpid',
                    type: serverWidget.FieldType.FLOAT,
                    label: 'Paygroup ID'
                });
                paygrpid.updateDisplayType({
                    displayType: serverWidget.FieldDisplayType.HIDDEN
                });

                // ===== Employee SuiteQL Query (updated 28/09/2026 for freelance / outsource) =====
                let sqlemp = `SELECT a.custrecord_hris_empchange_employee_nam,
                                     BUILTIN.DF(a.custrecord_hris_empchange_employee_nam) as empname,
                                     MAX(custrecord_hris_empchange_increment_eff),
                                     a.custrecord_hris_empchange_emp_pay_pro_gp,
                                     a.custrecord_hris_empchange_date_of_join,
                                     a.custrecord_hris_empchange_emp_code
                              FROM customrecord_hris_employee_compen_change a
                              INNER JOIN employee b ON b.id = a.custrecord_hris_empchange_employee_nam
                              LEFT JOIN customrecord_hrms_monthlyattendance m
                                     ON a.custrecord_hris_empchange_employee_nam = m.custrecord_hrms_month_empid
                              INNER JOIN customrecord_hris_employeecategory c
                                     ON b.custentity_hris_empcategory = c.id
                              WHERE a.custrecord_hris_empchange_emp_active_sts = 1
                                AND a.custrecord_hris_empchange_emp_pay_pro_gp = ${Paygrp}
                                AND a.custrecord_hris_empchange_subsidiary = ${Subsidiary}
                                AND b.isinactive = 'F'
                                AND a.custrecord_hris_empchange_date_of_join <= '${WagePeriodNew}'
                                AND (
                                      (
                                          b.custentity_hris_empispayroll = 'T'
                                          AND b.custentity_hris_empistimesheetapplicable = 'T'
                                          AND m.custrecord_hrms_month_monthid = ${WagePeriod}
                                          AND BUILTIN.DF(m.custrecord_hrms_month_yearid) = '${WageYear}'
                                          AND m.custrecord_hrms_month_paygroup = ${Paygrp}
                                      )
                                      OR
                                      (
                                          b.custentity_hris_empispayroll = 'T'
                                          AND c.custrecord_hris_empcat_seqno = 4
                                      )
                                    )`;

                if (department && department !== '') {
                    sqlemp += ` AND b.custentity_hris_empdepartment_new = ${department}`;
                }

                sqlemp += ` GROUP BY a.custrecord_hris_empchange_employee_nam,
                                     BUILTIN.DF(a.custrecord_hris_empchange_employee_nam),
                                     a.custrecord_hris_empchange_emp_pay_pro_gp,
                                     a.custrecord_hris_empchange_date_of_join,
                                     a.custrecord_hris_empchange_emp_code`;

                log.debug('Final Employee Query', sqlemp);

                const queryRes = query.runSuiteQL({ query: sqlemp });
                const empResult = queryRes.asMappedResults();
                log.audit('Empresult', empResult.length);

                if (empResult.length > 0) {
                    for (let loop = 0; loop < empResult.length; loop++) {
                        const emprow = empResult[loop];
                        const emp_id = emprow.empname;
                        const slno = (loop + 1).toString();
                        const emp_code = emprow.custrecord_hris_empchange_emp_code;
                        const employeeid = emprow.custrecord_hris_empchange_employee_nam;
                        const paygrpidVal = emprow.custrecord_hris_empchange_emp_pay_pro_gp;

                        emp_sublist.setSublistValue({
                            id: 'custpage_sno',
                            line: loop,
                            value: slno
                        });
                        emp_sublist.setSublistValue({
                            id: 'custpage_em',
                            line: loop,
                            value: emp_id
                        });
                        emp_sublist.setSublistValue({
                            id: 'custpage_empcode',
                            line: loop,
                            value: emp_code
                        });
                        emp_sublist.setSublistValue({
                            id: 'custpage_empid',
                            line: loop,
                            value: employeeid
                        });
                        emp_sublist.setSublistValue({
                            id: 'custpage_paygrpid',
                            line: loop,
                            value: paygrpidVal
                        });
                    }

                    Emp_List.addSubmitButton({
                        label: 'Start Pay Process'
                    });
                    Emp_List.clientScriptModulePath = './hris_payrollprocess_cl';

                    context.response.writePage(Emp_List);
                } else {
                    context.response.write('<b>Data Not Found for the selected PAY GROUP</b>');
                }
            }

            // ===== POST Method =====
            if (context.request.method === 'POST') {
                const empList1 = [];
                // const empList2 = [];
                // const empList3 = [];
                // const empList4 = [];
                // const empList5 = [];
                let count = 0;

                const payGroup = context.request.parameters.custpage_paygroup;
                const wageMonth = context.request.parameters.custpage_wageperiod;
                const year = context.request.parameters.custpage_wageyr;
                const payfreq = context.request.parameters.custpage_payfrq;
                const Subsidiaryid = context.request.parameters.custpage_subsidiary;
                const department = context.request.parameters.custpage_department;
                // const employeeCat = context.request.parameters.custpage_employeecat;

                const sublistCount = context.request.getLineCount({
                    group: 'custpage_apm_employee_sublist'
                });

                if (sublistCount > 0) {
                    for (let i = 0; i < sublistCount; i++) {
                        const checked_emps = context.request.getSublistValue({
                            group: 'custpage_apm_employee_sublist',
                            name: 'custscript_apm_check',
                            line: i
                        });

                        if (checked_emps === 'T') {
                            const checked_emps_name = context.request.getSublistValue({
                                group: 'custpage_apm_employee_sublist',
                                name: 'custpage_empid',
                                line: i
                            });

                            const paygroup = context.request.getSublistValue({
                                group: 'custpage_apm_employee_sublist',
                                name: 'custpage_paygrpid',
                                line: i
                            });

                            empList1.push({
                                empid: parseInt(checked_emps_name, 10),
                                paygroup: parseInt(paygroup, 10),
                                wagemonth: wageMonth,
                                linecount: count,
                                yeartext: year,
                                payfreq: payfreq,
                                subsidiary: Subsidiaryid,
                                department: department
                                // employeecat: employeeCat
                            });

                            count++;
                        }
                    }

                    log.audit('POST', `empList1***********==${JSON.stringify(empList1)}`);

                    // Optional email notification
                    const senderid = -5;
                    email.send({
                        author: senderid,
                        recipients: 'florence@nijatech.com',
                        subject: 'Employee List',
                        body: JSON.stringify(empList1),
                        isInternalOnly: true
                    });

                    // Map/Reduce Task - Batch 1
                    const mrTask1 = task.create({
                        taskType: task.TaskType.MAP_REDUCE,
                        scriptId: 'customscript_hris_payroll_process_mrs',
                        // deploymentId: 'customdeploy_hris_payroll_process_mrs',
                        params: {
                            custscript_hrms_preempid: JSON.stringify(empList1)
                        }
                    });
                    const mrTaskId1 = mrTask1.submit();
                    log.debug('mrTaskId1', mrTaskId1);

                    /*
                    // Additional batches (currently commented out in original)
                    const mrTask2 = task.create({
                        taskType: task.TaskType.MAP_REDUCE,
                        scriptId: 'customscript_hris_payroll_process_mrs',
                        params: {
                            custscript_hrms_preempid: JSON.stringify(empList2)
                        }
                    });
                    // ... similarly for batch 3, 4, 5
                    */

                    redirect.toSuitelet({
                        scriptId: 'customscript_hris_payrollprocess_sl',
                        deploymentId: 'customdeploy_hris_payrollprocess_sl'
                    });
                }
            }
        };

        const _logValidation = (value) => {
            return (value !== 'null' && value !== null && value !== '' &&
                    value !== undefined && value !== 'undefined' && !isNaN(value));
        };

        return {
            onRequest
        };
    });