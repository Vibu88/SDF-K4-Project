/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope Public
 */
define(['N/search', 'N/query', 'N/format', 'N/record', 'N/currentRecord', 'N/url', './moment.js', 'N/runtime'],
    (search, query, format, record, currentRecord, url, moment, runtime) => {

        const pageInit = (scriptContext) => {
            // debugger;
            try {
                const leaverecord = scriptContext.currentRecord;

                if (scriptContext.mode === 'create') {
                    const windowUrl = window.location.href;
                    const urlParams = new URL(windowUrl).searchParams;
                    const emp = urlParams.get('record.custrecord_hris_lve_employeename');

                    if (emp) {
                        leaverecord.setValue({
                            fieldId: 'custrecord_hris_lve_employeename',
                            value: emp,
                            ignoreFieldChange: true,
                            forceSyncSourcing: true
                        });
                    }
                }
            } catch (e) {
                console.log(`error in pageinit : ${e}`);
            }
        };

        const fieldChanged = (scriptContext) => {
            // debugger;
            try {
                const leaverecord = scriptContext.currentRecord;

                // ===== From Date / To Date / Total Days =====
                if (scriptContext.fieldId === 'custrecord_hris_lve_fromdate' ||
                    scriptContext.fieldId === 'custrecord_hris_lve_todate' ||
                    scriptContext.fieldId === 'custrecord_hris_lve_totalnodays') {

                    let fromdate = leaverecord.getValue({ fieldId: 'custrecord_hris_lve_fromdate' }) || '';
                    log.debug('fromdate', fromdate);

                    let todate = leaverecord.getValue({ fieldId: 'custrecord_hris_lve_todate' }) || '';
                    log.debug('todate', todate);

                    const approvalstatus = leaverecord.getValue({ fieldId: 'custrecord_hris_lve_hrmsapprovalstatus' });
                    const leavetype = leaverecord.getValue({ fieldId: 'custrecord_hris_lve_leavetype' }) || '';
                    log.debug('Leave Type', leavetype);

                    const Leave_type_seqno = get_sequence_no(leavetype);

                    // Annual Leave Balance Calculation
                    if (fromdate && approvalstatus != 2 && Leave_type_seqno == 3) {
                        fromdate = format.parse({ value: fromdate, type: format.Type.DATE });

                        if (todate) {
                            todate = format.parse({ value: todate, type: format.Type.DATE });
                        }

                        const empname = leaverecord.getValue({ fieldId: 'custrecord_hris_lve_employeename' }) || '';
                        log.debug('Employee Name', empname);

                        const empDetails = getEmployeeStatus(empname);
                        log.debug('empDetails', JSON.stringify(empDetails));

                        if (empDetails && empDetails.length > 0) {
                            const empDetailsRecord = empDetails[0];
                            const empStatus = empDetailsRecord.empStatus;
                            const empJoinDate = empDetailsRecord.empJoinDate;

                            const empHireDateObj = format.parse({
                                value: empJoinDate,
                                type: format.Type.DATE
                            });
                            log.debug('empStatus', empStatus);

                            if (empStatus == 3) {
                                let dateConsidered;
                                let finalleavebal = 0;
                                let obLeaveBalance = 0;

                                const obDetails = getEmployeeOBDetails(empname, leavetype);
                                log.debug('obDetails', JSON.stringify(obDetails));

                                if (obDetails && obDetails.length > 0) {
                                    const obDetailsecord = obDetails[0];
                                    obLeaveBalance = obDetailsecord.obleavebalance;
                                    const obDate = obDetailsecord.obdate;

                                    const parsedOBDate = format.parse({
                                        value: obDate,
                                        type: format.Type.DATE
                                    });

                                    dateConsidered = new Date(parsedOBDate);
                                    dateConsidered.setDate(dateConsidered.getDate() + 1);
                                } else {
                                    dateConsidered = empHireDateObj;
                                }

                                finalleavebal = searchLeaveBalance(empname, query, empHireDateObj, format, moment, dateConsidered, fromdate, leavetype);
                                log.debug('leavebalsearch', JSON.stringify(finalleavebal));

                                leaverecord.setValue({
                                    fieldId: 'custrecord_hris_lve_leavebalance',
                                    value: finalleavebal.toFixed(2),
                                    ignoreFieldChange: true,
                                    forceSyncSourcing: true
                                });

                                const roundfinalleavebal = GetRoundOffvalue(finalleavebal);
                                leaverecord.setValue({
                                    fieldId: 'custrecord_hris_lve_leavebalance_wholeno',
                                    value: roundfinalleavebal,
                                    ignoreFieldChange: true,
                                    forceSyncSourcing: true
                                });
                            }
                        }
                    }

                    // Emergency Leave Validation (max 15 days)
                    if (fromdate && todate && Leave_type_seqno == 13) {
                        const fromdateno = fromdate.getMonth() + 1;
                        log.debug('Month Number', fromdateno);

                        const fromdateyear = fromdate.getFullYear();
                        log.debug('Month year', fromdateyear);

                        let totaldays = leaverecord.getValue({ fieldId: 'custrecord_hris_lve_totalnodays' }) || 0;
                        log.debug('totaldays', totaldays);

                        const empname = leaverecord.getValue({ fieldId: 'custrecord_hris_lve_employeename' }) || '';
                        log.debug('Employee Name', empname);

                        const totalnodays = gettingemergencyleavedays(empname, leavetype, fromdateyear);
                        totaldays = parseFloat(totaldays) + parseFloat(totalnodays);

                        if (totaldays != 0 && totaldays > 15) {
                            alert('You Should not apply Emergency Leave greater than 15');

                            leaverecord.setValue({
                                fieldId: 'custrecord_hris_lve_todate',
                                value: '',
                                ignoreFieldChange: true,
                                forceSyncSourcing: true
                            });
                            leaverecord.setValue({
                                fieldId: 'custrecord_hris_lve_totalnodays',
                                value: '',
                                ignoreFieldChange: true,
                                forceSyncSourcing: true
                            });
                            return false;
                        }
                    }

                    // Annual Leave Labour Validation
                    if (fromdate && todate && Leave_type_seqno == 3) {
                        const empname = leaverecord.getValue({ fieldId: 'custrecord_hris_lve_employeename' }) || '';
                        log.debug('Employee Name', empname);

                        const empcatagorylist = getemployeecatagorysequence(empname);
                        const empcatagorydetails = empcatagorylist.toString().split('#');
                        const empcatagory = empcatagorydetails[0];
                        const empcatagorydays = empcatagorydetails[1];
                        const airticketcal = empcatagorydetails[2];

                        const negativeallowancelist = getnegativeallow(leavetype);
                        const negativeallowancedetails = negativeallowancelist.toString().split('#');
                        const leavesequence = negativeallowancedetails[0];
                        const negativeallowcheck = negativeallowancedetails[1];
                        const maxnegativeallow = negativeallowancedetails[2];

                        const fromdateno = fromdate.getMonth() + 1;
                        log.debug('Month Number', fromdateno);

                        const fromdateyear = fromdate.getFullYear();
                        log.debug('Month year', fromdateyear);

                        let totaldays = leaverecord.getValue({ fieldId: 'custrecord_hris_lve_totalnodays' }) || 0;
                        log.debug('totaldays', totaldays);

                        const totalnodays = gettingannualleavedays(empname, leavetype, fromdateyear);
                        totaldays = parseFloat(totaldays) + parseFloat(totalnodays);

                        let comparedays = negativeallowcheck == 'T'
                            ? parseFloat(empcatagorydays) + parseFloat(maxnegativeallow)
                            : parseFloat(empcatagorydays);

                        if (totaldays != 0 && empcatagory == 2 && totaldays > comparedays) {
                            alert(`You should not apply Annual Leave greater than ${comparedays}`);

                            leaverecord.setValue({
                                fieldId: 'custrecord_hris_lve_todate',
                                value: '',
                                ignoreFieldChange: false,
                                forceSyncSourcing: true
                            });
                            leaverecord.setValue({
                                fieldId: 'custrecord_hris_lve_totalnodays',
                                value: '',
                                ignoreFieldChange: false,
                                forceSyncSourcing: true
                            });
                            return false;
                        } else if (totaldays != 0 && (empcatagory == 1 || empcatagory == 3) && totaldays > comparedays) {
                            alert(`You should not apply Annual Leave greater than ${comparedays}`);

                            leaverecord.setValue({
                                fieldId: 'custrecord_hris_lve_todate',
                                value: '',
                                ignoreFieldChange: false,
                                forceSyncSourcing: true
                            });
                            leaverecord.setValue({
                                fieldId: 'custrecord_hris_lve_totalnodays',
                                value: '',
                                ignoreFieldChange: false,
                                forceSyncSourcing: true
                            });
                            return false;
                        }
                    }
                }

                // ===== From Date specific validations =====
                if (scriptContext.fieldId === 'custrecord_hris_lve_fromdate') {
                    const emp_name = leaverecord.getValue('custrecord_hris_lve_employeename');
                    const Leave_type = leaverecord.getValue('custrecord_hris_lve_leavetype') || '';
                    const hireDate = leaverecord.getValue('custrecord_hris_lve_hiredate');
                    const fromdate = leaverecord.getValue({ fieldId: 'custrecord_hris_lve_fromdate' }) || '';

                    log.debug('Leave_type', Leave_type);
                      // Added for Last Working Date
                    if (fromdate) {

                        // Convert to Date object (safety)
                        var fromDateObj = new Date(fromdate);

                        // Subtract 1 day
                        fromDateObj.setDate(fromDateObj.getDate() - 1);

                        // Set Last Working Date
                        leaverecord.setValue({
                            fieldId: 'custrecord_hris_lve_lastworkingdate',
                            value: fromDateObj
                        });
                    }
                    if (Leave_type) {
                        const Leave_type_seqno = get_sequence_no(Leave_type);
                        const proratacheck = proratecheck(Leave_type);
                        const servicecheckdetails = get_service_check(Leave_type);
                        const servicecheckdetailsarray = servicecheckdetails.split('#');
                        const servicecheck = servicecheckdetailsarray[0];
                        const servicedays = servicecheckdetailsarray[1];

                        // Service period validation for Annual Leave
                        if (Leave_type_seqno == 3 && servicecheck == 'T' && emp_name && hireDate && fromdate !== '') {
                            const empcatagorylist = getemployeecatagorysequence(emp_name);
                            const empcatagorydetails = empcatagorylist.toString().split('#');
                            const empcatagory = empcatagorydetails[0];

                            if (empcatagory == 2 || empcatagory == 1 || empcatagory == 3) {
                                let compareDate = moment(hireDate).add(servicedays, 'days');
                                compareDate = format.parse({ value: compareDate, type: format.Type.DATE });

                                if (compareDate >= fromdate) {
                                    alert('You are allowed to take Annual Leave only after completion of service');
                                    leaverecord.setValue({
                                        fieldId: 'custrecord_hris_lve_fromdate',
                                        value: '',
                                        ignoreFieldChange: true,
                                        forceSyncSourcing: true
                                    });
                                    return false;
                                }

                                // Rejoin date checking
                                const rejoindate = gettingleaverejoindate(Leave_type, emp_name);
                                if (rejoindate !== '') {
                                    compareDate = moment(rejoindate).add(servicedays, 'days');
                                    compareDate = format.parse({ value: compareDate, type: format.Type.DATE });

                                    if (compareDate >= fromdate) {
                                        alert('You are allowed to take Annual Leave only after completion of rejoining date of the previous annual leave.');
                                        leaverecord.setValue({
                                            fieldId: 'custrecord_hris_lve_fromdate',
                                            value: '',
                                            ignoreFieldChange: true,
                                            forceSyncSourcing: true
                                        });
                                        return false;
                                    }
                                }
                            }
                        }

                        // General service check
                        if (servicecheck == 'T' && servicedays != 0 && fromdate !== '') {
                            let compareDate = moment(hireDate).add(servicedays, 'days');
                            compareDate = format.parse({ value: compareDate, type: format.Type.DATE });

                            if (compareDate >= fromdate) {
                                alert('You are allowed to take this leave after completion of one year');
                                leaverecord.setValue({
                                    fieldId: 'custrecord_hris_lve_fromdate',
                                    value: '',
                                    ignoreFieldChange: true,
                                    forceSyncSourcing: true
                                });
                                return false;
                            }
                        }

                        // Confirmed status check
                        if (Leave_type_seqno != 2 && Leave_type_seqno != 5 && Leave_type_seqno != 25) {
                            const employeesql = `SELECT * FROM employee WHERE id = '${emp_name}' AND custentity_emp_employee_job_status = 3 AND isinactive = 'F'`;
                            log.debug('employeesql', employeesql);

                            const queryResult = query.runSuiteQL({ query: employeesql });
                            const employeesqlrecords = queryResult.asMappedResults();
                            log.debug('employeesqlrecords.length', employeesqlrecords.length);

                            if (employeesqlrecords.length === 0) {
                                alert('Selected Leave can be applied once your appointment status is CONFIRMED!');
                                leaverecord.setValue({ fieldId: 'custrecord_hris_lve_leavetype', value: '', ignoreFieldChange: true, forceSyncSourcing: true });
                                leaverecord.setValue({ fieldId: 'custrecord_hris_lve_leavebalance', value: '', ignoreFieldChange: true, forceSyncSourcing: true });
                                leaverecord.setValue({ fieldId: 'custrecord_hris_lve_leavebalance_wholeno', value: '', ignoreFieldChange: true, forceSyncSourcing: true });
                                return false;
                            }
                        }

                        // Comp-off specific
                        if (Leave_type_seqno == 5) {
                            const ValidtillDate = leaverecord.getValue('custrecord_hris_lve_validtilldate');
                            const fromDATE = leaverecord.getValue({ fieldId: 'custrecord_hris_lve_fromdate' }) || '';

                            if (ValidtillDate) {
                                const formattedValid = moment(ValidtillDate).format('DD/MM/YYYY');
                                let compoffDATE = getcompoffdate(formattedValid, emp_name);

                                if (compoffDATE !== '') {
                                    compoffDATE = format.parse({ value: compoffDATE, type: format.Type.DATE });
                                    const parsedFrom = format.parse({ value: fromDATE, type: format.Type.DATE });

                                    if (parsedFrom < compoffDATE) {
                                        alert('You can not apply leave on before date of raise compoff date');
                                        return false;
                                    }
                                }
                            } else {
                                alert('Please raise the compoff first.');
                                leaverecord.setValue({
                                    fieldId: 'custrecord_hris_lve_fromdate',
                                    value: '',
                                    ignoreFieldChange: true,
                                    forceSyncSourcing: true
                                });
                                return false;
                            }
                        }
                    }
                }

                // ===== Employee Name change =====
                if (scriptContext.fieldId === 'custrecord_hris_lve_employeename') {
                    const employee = leaverecord.getValue('custrecord_hris_lve_employeename');
                    const employeecompensql = `SELECT * FROM customrecord_hris_employee_compen_change WHERE custrecord_hris_empchange_employee_nam = '${employee}' AND isinactive = 'F'`;
                    log.debug('employeecompensql', employeecompensql);

                    const queryResult = query.runSuiteQL({ query: employeecompensql });
                    const employeecompensqlrecords = queryResult.asMappedResults();
                    log.debug('employeecompensqlrecords.length', employeecompensqlrecords.length);

                    if (employeecompensqlrecords.length === 0) {
                        alert('Selected Employee is connected with Payroll. And Pay Process Group is not defined for selected employee. Please contact HR team for further details !');
                        leaverecord.setValue({
                            fieldId: 'custrecord_hris_lve_employeename',
                            value: '',
                            ignoreFieldChange: true,
                            forceSyncSourcing: true
                        });
                        return false;
                    }
                }

                // ===== Leave Type change =====
                if (scriptContext.fieldId === 'custrecord_hris_lve_leavetype') {
                    const Leave_type = leaverecord.getValue('custrecord_hris_lve_leavetype') || '';
                    const emp_name = leaverecord.getValue('custrecord_hris_lve_employeename');
                    log.debug('Leave_type', Leave_type);

                    if (Leave_type) {
                        const Leave_type_seqno = get_sequence_no(Leave_type);

                        if (Leave_type_seqno != 2 && Leave_type_seqno != 5 && Leave_type_seqno != 25) {
                            const employeesql = `SELECT * FROM employee WHERE id = '${emp_name}' AND custentity_emp_employee_job_status = 3 AND isinactive = 'F'`;
                            log.debug('employeesql', employeesql);

                            const queryResult = query.runSuiteQL({ query: employeesql });
                            const employeesqlrecords = queryResult.asMappedResults();

                            if (employeesqlrecords.length === 0) {
                                alert('Selected Leave can be applied once your appointment status is CONFIRMED!');
                                leaverecord.setValue({ fieldId: 'custrecord_hris_lve_leavetype', value: '', ignoreFieldChange: true, forceSyncSourcing: true });
                                leaverecord.setValue({ fieldId: 'custrecord_hris_lve_leavebalance', value: '', ignoreFieldChange: true, forceSyncSourcing: true });
                                leaverecord.setValue({ fieldId: 'custrecord_hris_lve_leavebalance_wholeno', value: '', ignoreFieldChange: true, forceSyncSourcing: true });
                                return false;
                            }
                        }

                        if (Leave_type_seqno == 5) {
                            const fromDATE = leaverecord.getValue({ fieldId: 'custrecord_hris_lve_fromdate' }) || '';
                            const compoffvalidDATElist = getcompoffvalidtilldate(emp_name);
                            const getcompoffvalidtilldatedetails = compoffvalidDATElist.toString().split('#');
                            let compoffvalidDATE = getcompoffvalidtilldatedetails[0];
                            const compoffvalidType = getcompoffvalidtilldatedetails[1];

                            if (compoffvalidDATE !== '') {
                                compoffvalidDATE = format.parse({ value: compoffvalidDATE, type: format.Type.DATE });
                                leaverecord.setValue('custrecord_hris_lve_validtilldate', compoffvalidDATE, true, true);
                                leaverecord.setValue('custrecord_hris_comp_off_type', compoffvalidType, true, true);
                            }
                        }
                    }
                }

                // ===== Encashment Days =====
                if (scriptContext.fieldId === 'custrecord_hris_lve_noofencashmentdays') {
                    let applied_no_of_encashmentDays = leaverecord.getValue('custrecord_hris_lve_noofencashmentdays');
                    let total_avail_encash_days = leaverecord.getValue('custrecord_hris_total_encashable_balance') || 0;
                    const max_encashDays = leaverecord.getValue('custrecord_hris_lve_maxencashabledayalow') || 0;

                    applied_no_of_encashmentDays = parseFloat(applied_no_of_encashmentDays);
                    total_avail_encash_days = parseFloat(total_avail_encash_days);

                    if (applied_no_of_encashmentDays > total_avail_encash_days) {
                        alert('Encashment Balance low');
                        leaverecord.setValue('custrecord_hris_lve_noofencashmentdays', '', true, true);
                    }

                    if (applied_no_of_encashmentDays > parseFloat(max_encashDays)) {
                        alert(`You are allowed to Encash maximum ${max_encashDays} days of leave`);
                        leaverecord.setValue('custrecord_hris_lve_noofencashmentdays', '', true, true);
                    }
                }

                // ===== Apply Leave Encashment checkbox =====
                if (scriptContext.fieldId === 'custrecord_hris_lve_applylveencashment') {
                    const encash = leaverecord.getValue('custrecord_hris_lve_applylveencashment');

                    if (encash === true) {
                        const emp_id = leaverecord.getValue('custrecord_hris_lve_employeename');
                        const leave_type = leaverecord.getValue('custrecord_hris_lve_leavetype');

                        const leavebalancesql = `SELECT * FROM customrecord_hris_leavebalance 
                                                 WHERE custrecord_hris_lvbal_employee_name = '${emp_id}' 
                                                   AND custrecord_hris_lvbal_leave_type = '${leave_type}' 
                                                   AND isinactive = 'F'`;
                        log.debug('leavebalancesql', leavebalancesql);

                        const queryResult = query.runSuiteQL({ query: leavebalancesql });
                        const leavebalancesqlrecords = queryResult.asMappedResults();

                        if (leavebalancesqlrecords.length > 0) {
                            let encash_bal = leavebalancesqlrecords[0].custrecord_hris_lvbal_encashable_days || 0;
                            if (!encash_bal) encash_bal = 0;

                            leaverecord.setValue('custrecord_hris_lve_encashmentlevbalance', encash_bal, true, true);

                            const leave_ball = leaverecord.getValue('custrecord_hris_lve_leavebalance');
                            const noOfDays = leaverecord.getValue('custrecord_hris_lve_totalnodays');
                            const remaining_bal = parseFloat(leave_ball) - parseFloat(noOfDays);
                            let total_avail_encash_days = parseFloat(encash_bal) + parseFloat(remaining_bal);
                            total_avail_encash_days = GetRoundOffvalue(total_avail_encash_days);

                            leaverecord.setValue('custrecord_hris_total_encashable_balance', total_avail_encash_days, true, true);
                        }
                    }
                }

                // ===== Additional From Date logic (Comp-off auto To Date) =====
                if (scriptContext.fieldId === 'custrecord_hris_lve_fromdate') {
                    const emp_name = leaverecord.getValue('custrecord_hris_lve_employeename');
                    const Leave_type = leaverecord.getValue('custrecord_hris_lve_leavetype') || '';
                    const from_date = leaverecord.getValue('custrecord_hris_lve_fromdate');
                    const seq_no = get_sequence_no(Leave_type);
                    const leave_bal = leaverecord.getValue('custrecord_hris_lve_leavebalance');

                    if (seq_no == 5) {
                        leaverecord.setValue('custrecord_hris_lve_todate', from_date);
                        leaverecord.getField({ fieldId: 'custrecord_hris_lve_todate' }).isDisabled = true;

                        if (leave_bal < 1) {
                            leaverecord.setValue('custrecord_hris_lve_totalnodays', leave_bal, false);
                        }
                        if (leave_bal >= 1) {
                            leaverecord.setValue('custrecord_hris_lve_totalnodays', 1, false);
                        }
                    }

                    return true;
                }

                // ===== To Date → Expected Resume Date =====
                if (scriptContext.fieldId === 'custrecord_hris_lve_todate') {
                    let toDate = leaverecord.getValue('custrecord_hris_lve_todate');

                    if (toDate) {
                        toDate = format.parse({ value: toDate, type: format.Type.DATE });
                        toDate = moment(toDate).add(1, 'days').format('DD/MM/YYYY');
                        toDate = format.parse({ value: toDate, type: format.Type.DATE });

                        leaverecord.setValue('custrecord_hris_lve_expectedresumebackdt', toDate, true, true);
                        leaverecord.setValue('custrecord_hris_lve_expectresback_dtorig', toDate, true, true);
                    } else {
                        leaverecord.setValue('custrecord_hris_lve_expectedresumebackdt', '', true, true);
                        leaverecord.setValue('custrecord_hris_lve_expectresback_dtorig', '', true, true);
                    }
                }

                // ===== Actual Resume Date =====
                if (scriptContext.fieldId === 'custrecord_hris_lve_actualresumedate') {
                    let totalDelayDays = leaverecord.getValue('custrecord_hris_lve_actualresumedate');
                    let from_date = leaverecord.getValue('custrecord_hris_lve_fromdate');
                    from_date = format.parse({ value: from_date, type: format.Type.DATE });

                    let expectedResumeDate = leaverecord.getValue('custrecord_hris_lve_expectedresumebackdt');

                    if (totalDelayDays && totalDelayDays !== '' && totalDelayDays != null) {
                        totalDelayDays = moment(totalDelayDays);
                        expectedResumeDate = moment(expectedResumeDate);
                        const daysDiff = totalDelayDays.diff(expectedResumeDate, 'days');
                        leaverecord.setValue('custrecord_hris_lve_actualtotdelaydays', daysDiff, true, true);
                    } else {
                        leaverecord.setValue('custrecord_hris_lve_actualtotdelaydays', '', true, true);
                    }

                    if (from_date && totalDelayDays) {
                        if (totalDelayDays <= from_date) {
                            alert('You can not Select Work resume as Leave From Date or Less then Leave From Date');
                            leaverecord.setValue('custrecord_hris_lve_actualresumedate', '', false, false);
                            leaverecord.setValue('custrecord_hris_lve_actualtotdelaydays', '', false, false);
                        }
                    }
                }

                // ===== Air Ticket Required =====
                if (scriptContext.fieldId === 'custrecord_hris_lve_airticketrequired') {
                    const airTicketAllChkbox = leaverecord.getValue('custrecord_hris_lve_airticketrequired');
                    const emp_Id = leaverecord.getValue('custrecord_hris_lve_employeename');
                    let fromDate = leaverecord.getValue('custrecord_hris_lve_fromdate');
                    const leaveType = leaverecord.getValue('custrecord_hris_lve_leavetype');

                    const LeaveConfigRecord = record.load({
                        type: 'customrecord_hris_leaveconfig',
                        id: leaveType,
                        isDynamic: true
                    });
                    const b_allowRotation = LeaveConfigRecord.getValue('custrecord_hris_lveconfig_rotationlve');

                    if (fromDate) {
                        fromDate = format.parse({ value: fromDate, type: format.Type.DATE });
                        const year = fromDate.getFullYear().toString();
                        const YearId = searchYear(year);

                        if (airTicketAllChkbox === true) {
                            const monthlysalarysql = `SELECT * FROM customrecord_hris_monthlysalinput a 
                                                      JOIN customrecord_hris_payroll_component b ON a.custrecord_hris_mthsal_paycomponent = b.id 
                                                      WHERE a.custrecord_hris_mthsal_empname = '${emp_Id}' 
                                                        AND b.custrecord_hris__sequence_no_ = 36 
                                                        AND a.isinactive = 'F' 
                                                        AND custrecord_hris_mthsal_year = ${YearId}`;
                            log.debug('monthlysalarysql', monthlysalarysql);

                            const queryResult = query.runSuiteQL({ query: monthlysalarysql });
                            const monthlysalarysqlrecords = queryResult.asMappedResults();

                            if (monthlysalarysqlrecords.length > 0 && b_allowRotation === false) {
                                alert(`You have already availed Air Ticket Allowance for the Year ${year}`);
                                leaverecord.setValue('custrecord_hris_lve_airticketrequired', false, false, false);
                            }
                        }
                    } else {
                        alert('Please enter From Date and To Date first');
                        leaverecord.setValue('custrecord_hris_lve_airticketrequired', false, false, false);
                    }
                }

            } catch (e) {
                log.debug(`error in fieldchange : ${e}`);
            }
        };

        // ==================== HELPER FUNCTIONS ====================

        const searchYear = (year) => {
            try {
                let yearVal = '';
                const yearsql = `SELECT id as internalid FROM customlist_hris_year_master WHERE name = ${year}`;
                const yearsqlrecord = getResult(yearsql);
                log.debug('yearsql', yearsql);

                if (yearsqlrecord.length > 0) {
                    for (let r = 0; r < yearsqlrecord.length; r++) {
                        yearVal = yearsqlrecord[r].internalid || 0;
                    }
                }
                log.debug('yearVal in SearchYear Func', yearVal);
                return yearVal;
            } catch (e) {
                log.debug(`error in searchyear : ${e}`);
            }
        };

        const get_sequence_no = (Leave_type) => {
            try {
                const leavesequencesql = `SELECT * FROM customrecord_hris_leaveconfig WHERE id = '${Leave_type}' AND isinactive = 'F'`;
                log.debug('leavesequencesql', leavesequencesql);

                const queryResult = query.runSuiteQL({ query: leavesequencesql });
                const leavesequencesqlrecords = queryResult.asMappedResults();

                if (leavesequencesqlrecords.length > 0) {
                    return leavesequencesqlrecords[0].custrecord_hris_lvecnfg_seqno;
                }
            } catch (e) {
                log.debug(`error in get_sequence_no : ${e}`);
            }
        };

        const get_service_check = (Leave_type) => {
            const leavesequencesql = `SELECT * FROM customrecord_hris_leaveconfig WHERE id = '${Leave_type}' AND isinactive = 'F'`;
            log.debug('leavesequencesql', leavesequencesql);

            const queryResult = query.runSuiteQL({ query: leavesequencesql });
            const leavesequencesqlrecords = queryResult.asMappedResults();

            if (leavesequencesqlrecords.length > 0) {
                const servicecheck = leavesequencesqlrecords[0].custrecord_hris_lveconfig_servicecomplet;
                const servicedays = leavesequencesqlrecords[0].custrecord_hris_lveconfig_sercompdays;
                return `${servicecheck}#${servicedays}`;
            }
            return 'F#0';
        };

        const proratecheck = (Leave_type) => {
            try {
                let proratacheck = 'F';
                const leavesequencesql = `SELECT * FROM customrecord_hris_leaveconfig WHERE id = '${Leave_type}' AND isinactive = 'F'`;
                log.debug('leavesequencesql', leavesequencesql);

                const queryResult = query.runSuiteQL({ query: leavesequencesql });
                const leavesequencesqlrecords = queryResult.asMappedResults();

                if (leavesequencesqlrecords.length > 0) {
                    proratacheck = leavesequencesqlrecords[0].custrecord_hris_lvecfg_pro_rata;
                }
                return proratacheck;
            } catch (e) {
                log.debug(`error in proratecheck : ${e}`);
            }
        };

        const gettingpassportexpirydate = (emp_name) => {
            try {
                const passportQuery = `SELECT MAX(a.custrecord_hris_date_exp) as expirydate 
                                       FROM customrecord_hris_emp_id_info a 
                                       JOIN customrecordhris_idcardmaster b ON a.custrecord_hris_emp_id_type = b.id
                                       WHERE a.isinactive = 'F' AND b.custrecord_hris_idcard_seqno = 2 AND a.custrecord_hris_emp_link = ${emp_name}`;

                const queryResults = query.runSuiteQL({ query: passportQuery });
                const passportQueryrecords = queryResults.asMappedResults();

                if (passportQueryrecords.length > 0) {
                    return passportQueryrecords[0].expirydate || '';
                }
                return '';
            } catch (e) {
                log.debug(`error in gettingpassportexpirydate : ${e}`);
            }
        };

        const gettingvisaexpirydate = (emp_name) => {
            try {
                const visaQuery = `SELECT MAX(a.custrecord_hris_date_exp) as expirydate 
                                   FROM customrecord_hris_emp_id_info a 
                                   JOIN customrecordhris_idcardmaster b ON a.custrecord_hris_emp_id_type = b.id 
                                   WHERE a.isinactive = 'F' AND b.custrecord_hris_idcard_seqno = 1 AND a.custrecord_hris_emp_link = ${emp_name}`;

                const queryResults = query.runSuiteQL({ query: visaQuery });
                const visaQueryrecords = queryResults.asMappedResults();

                if (visaQueryrecords.length > 0) {
                    return visaQueryrecords[0].expirydate || '';
                }
                return '';
            } catch (e) {
                log.debug(`error in gettingvisaexpirydate : ${e}`);
            }
        };

        const gettingempcatagorysequence = (empname) => {
            try {
                const empQuery = `SELECT b.id as empcatagoryid, b.custrecord_hris_empcat_seqno as seqno 
                                  FROM employee a 
                                  JOIN customrecord_hris_employeecategory b ON a.custentity_hris_empcategory = b.id 
                                  WHERE a.id = ${empname} AND b.isinactive = 'F'`;

                const queryResults = query.runSuiteQL({ query: empQuery });
                const empQueryrecords = queryResults.asMappedResults();

                if (empQueryrecords.length > 0) {
                    return empQueryrecords[0].seqno;
                }
            } catch (e) {
                log.debug(`error in gettingempcatagorysequence : ${e}`);
            }
        };

        const gettingvisarenewaldate = (emp_name) => {
            try {
                const visaQuery = `SELECT MAX(a.custrecord_hris_date_issue) as renewaldate 
                                   FROM customrecord_hris_emp_id_info a 
                                   JOIN customrecordhris_idcardmaster b ON a.custrecord_hris_emp_id_type = b.id 
                                   WHERE a.isinactive = 'F' AND b.custrecord_hris_idcard_seqno = 1 AND a.custrecord_hris_emp_link = ${emp_name}`;

                const queryResults = query.runSuiteQL({ query: visaQuery });
                const visaQueryrecords = queryResults.asMappedResults();

                if (visaQueryrecords.length > 0) {
                    return visaQueryrecords[0].renewaldate || '';
                }
                return '';
            } catch (e) {
                log.debug(`error in gettingvisarenewaldate : ${e}`);
            }
        };

        const gettingemployeerejoindate = (empname) => {
            try {
                const empQuery = `SELECT b.id as empcatagoryid, b.custrecord_hris_empcat_seqno as seqno, a.custentity_hris_rejoin_date as rejoindate 
                                  FROM employee a 
                                  JOIN customrecord_hris_employeecategory b ON a.custentity_hris_empcategory = b.id 
                                  WHERE a.id = ${empname} AND b.isinactive = 'F'`;

                const queryResults = query.runSuiteQL({ query: empQuery });
                const empQueryrecords = queryResults.asMappedResults();

                if (empQueryrecords.length > 0) {
                    return empQueryrecords[0].rejoindate || '';
                }
                return '';
            } catch (e) {
                log.debug(`error in gettingemployeerejoindate : ${e}`);
            }
        };

        const check_rotation = (Leave_type) => {
            try {
                const leavesequencesql = `SELECT * FROM customrecord_hris_leaveconfig WHERE id = '${Leave_type}' AND isinactive = 'F'`;
                log.debug('leavesequencesql', leavesequencesql);

                const queryResult = query.runSuiteQL({ query: leavesequencesql });
                const leavesequencesqlrecords = queryResult.asMappedResults();

                if (leavesequencesqlrecords.length > 0) {
                    return leavesequencesqlrecords[0].custrecord_hris_lveconfig_rotationlve;
                }
            } catch (e) {
                log.debug(`error in check_rotation : ${e}`);
            }
        };

        const GetRoundOffvalue = (finalAnnual) => {
            const final_days = finalAnnual;
            log.debug(`final_days************************************${final_days}`);

            const split_final_days = final_days.toString().split('.');
            const integer_no = split_final_days[0];
            log.debug(`integer_no************************************${integer_no}`);

            return parseFloat(integer_no);
        };

        const searchLeaveBalance = (empInternalId, query, empHireDateObj, format, moment, dateConsidered, currentdate, leavetype) => {
            let finalleavebal = 0;

            const leavebalancesql = `SELECT a.*, b.custrecord_hris_lvecfg_accuraldays as accuraldays 
                                     FROM customrecord_hris_leavebalance a 
                                     JOIN customrecord_hris_leaveconfig b ON a.custrecord_hris_lvbal_leave_type = b.id
                                     WHERE a.custrecord_hris_lvbal_employee_name = '${empInternalId}' 
                                       AND a.custrecord_hris_lvbal_leave_type = '${leavetype}' 
                                       AND a.isinactive = 'F'
                                       AND b.custrecord_hris_lvecnfg_seqno = 3`;

            log.debug('leavebalancesql', leavebalancesql);

            const queryResult = query.runSuiteQL({ query: leavebalancesql });
            const leavebalancesqlrecords = queryResult.asMappedResults();
            log.debug('leavebalancesqlrecords.length', leavebalancesqlrecords.length);

            if (leavebalancesqlrecords.length > 0) {
                const obleavebalance = leavebalancesqlrecords[0].custrecord_hris_lvbal_openingbalance || 0;
                const leavebaltaken = leavebalancesqlrecords[0].custrecord_hris_lvbal_leave_balance_take || 0;
                const accuraldays = leavebalancesqlrecords[0].accuraldays || 1;

                const currentMoment = formatdate(currentdate);
                const dateConsideredMoment = formatdate(dateConsidered);

                let diffDays = getDaysDifference(currentMoment, dateConsideredMoment);
                log.debug('Diff Days', diffDays);

                diffDays = diffDays + 1;
                log.audit('Add Diff Days', diffDays);

                const leaveBalance = diffDays * accuraldays;
                log.debug('LeaveBalance', leaveBalance);

                finalleavebal = parseFloat(obleavebalance) + parseFloat(leaveBalance) - parseFloat(leavebaltaken);
                log.debug('finalleavebal', finalleavebal);
            }
            return finalleavebal;
        };

        const gettingemergencyleavedays = (empname, leavetype, fromdateyear) => {
            try {
                const emergencysql = `SELECT NVL(SUM(a.custrecord_hris_lve_totalnodays), 0) AS totdays,
                                             EXTRACT(YEAR FROM a.custrecord_hris_lve_fromdate) as leave_year 
                                      FROM customrecord_hris_leaveapplication a 
                                      JOIN customrecord_hris_leaveconfig b ON a.custrecord_hris_lve_leavetype = b.id  
                                      WHERE a.custrecord_hris_lve_employeename = ${empname} 
                                        AND a.custrecord_hris_lve_leavetype = ${leavetype} 
                                        AND EXTRACT(YEAR FROM a.custrecord_hris_lve_fromdate) = ${fromdateyear}
                                        AND a.custrecord_hris_lve_hrmsapprovalstatus = 2 
                                        AND custrecord_hris_lve_cancellation = 'F' 
                                      GROUP BY EXTRACT(YEAR FROM a.custrecord_hris_lve_fromdate)`;

                const queryResults = query.runSuiteQL({ query: emergencysql });
                const emergencysqlrecord = queryResults.asMappedResults();
                log.debug('emergencysql', emergencysql);

                let totalnodays = 0;
                if (emergencysqlrecord.length > 0) {
                    totalnodays = emergencysqlrecord[0].totdays || 0;
                }
                return totalnodays;
            } catch (e) {
                log.error('Error in gettingemergencyleavedays', e);
            }
        };

        const formatdate = (currentdate) => {
            const day = currentdate.getDate();
            const month = currentdate.getMonth() + 1;
            const year = currentdate.getFullYear();
            return `${day}/${month}/${year}`;
        };

        const parseDate = (str) => {
            const parts = str.split('/');
            const day = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1;
            const year = parseInt(parts[2], 10);
            return new Date(year, month, day);
        };

        const getDaysDifference = (dateStr1, dateStr2) => {
            const date1 = parseDate(dateStr1);
            const date2 = parseDate(dateStr2);

            if (!(date1 instanceof Date) || !(date2 instanceof Date)) {
                throw new Error('Invalid Date conversion');
            }

            const diffMs = date1.getTime() - date2.getTime();
            log.audit('diffMs', diffMs);
            return Math.round(diffMs / (1000 * 60 * 60 * 24));
        };

        const getemployeecatagorysequence = (empname) => {
            try {
                const empcatagorysql = `SELECT b.id as empcatagoryid, b.custrecord_hris_empcat_seqno as seqno,
                                               b.custrecord_hris_empcat_noofdays as noofdays,
                                               b.custrecord_hris_empcat_airticket as airticketdays 
                                        FROM employee a 
                                        JOIN customrecord_hris_employeecategory b ON a.custentity_hris_empcategory = b.id 
                                        WHERE a.id = ${empname} AND b.isinactive = 'F'`;

                log.debug('empcatagorysql', empcatagorysql);

                const queryResults = query.runSuiteQL({ query: empcatagorysql });
                const empcatagorysqlrecords = queryResults.asMappedResults();

                if (empcatagorysqlrecords.length > 0) {
                    const empcatid = empcatagorysqlrecords[0].seqno;
                    const noofdays = empcatagorysqlrecords[0].noofdays || 0;
                    const airticketcal = empcatagorysqlrecords[0].airticketdays || 0;
                    return `${empcatid}#${noofdays}#${airticketcal}`;
                }
                return '0#0#0';
            } catch (e) {
                log.error('Error in getemployeecatagorysequence', e);
            }
        };

        const getnegativeallow = (leaveType) => {
            let sequenceNo = '';
            let negAllowChk = '';
            let maxNegAllow = '';

            const resultSet = query.runSuiteQL({
                query: `SELECT custrecord_hris_lvecnfg_seqno,
                               custrecord_hris_lveconfig_allowneglevbal,
                               custrecord_hris_lvecfg_maxnegativebal 
                        FROM customrecord_hris_leaveconfig 
                        WHERE id = ?`,
                params: [leaveType]
            });

            const results = resultSet.asMappedResults();

            if (results.length > 0) {
                const result = results[0];
                sequenceNo = result.custrecord_hris_lvecnfg_seqno || '';
                negAllowChk = result.custrecord_hris_lveconfig_allowneglevbal || '';
                maxNegAllow = result.custrecord_hris_lvecfg_maxnegativebal || '';
            }

            return `${sequenceNo}#${negAllowChk}#${maxNegAllow}`;
        };

        const gettingannualleavedays = (empname, leavetype, fromdateyear) => {
            try {
                const annualsql = `SELECT NVL(SUM(a.custrecord_hris_lve_totalnodays), 0) AS totdays,
                                          EXTRACT(YEAR FROM a.custrecord_hris_lve_fromdate) as leave_year 
                                   FROM customrecord_hris_leaveapplication a 
                                   JOIN customrecord_hris_leaveconfig b ON a.custrecord_hris_lve_leavetype = b.id  
                                   WHERE a.custrecord_hris_lve_employeename = ${empname} 
                                     AND a.custrecord_hris_lve_leavetype = ${leavetype} 
                                     AND EXTRACT(YEAR FROM a.custrecord_hris_lve_fromdate) = ${fromdateyear}
                                     AND a.custrecord_hris_lve_hrmsapprovalstatus = 2 
                                     AND custrecord_hris_lve_cancellation = 'F' 
                                   GROUP BY EXTRACT(YEAR FROM a.custrecord_hris_lve_fromdate)`;

                const queryResults = query.runSuiteQL({ query: annualsql });
                const annualsqlrecord = queryResults.asMappedResults();
                log.debug('annualsql', annualsql);

                let totalnodays = 0;
                if (annualsqlrecord.length > 0) {
                    totalnodays = annualsqlrecord[0].totdays || 0;
                }
                return totalnodays;
            } catch (e) {
                log.error('Error in gettingannualleavedays', e);
            }
        };

        const gettingleaverejoindate = (Leave_type, emp_name) => {
            try {
                let rejoindate = '';
                const leaveQuery = `SELECT * FROM customrecord_hris_leaveapplication  
                                    WHERE custrecord_hris_lve_leavetype = ${Leave_type}
                                      AND custrecord_hris_lve_workresume = 'T' 
                                      AND isinactive = 'F'
                                      AND custrecord_hris_lve_employeename = ${emp_name}`;

                const queryResults = query.runSuiteQL({ query: leaveQuery });
                const leaveQueryrecords = queryResults.asMappedResults();

                if (leaveQueryrecords.length > 0) {
                    rejoindate = leaveQueryrecords[0].custrecord_hris_lve_actualresumedate;
                    if (rejoindate) {
                        rejoindate = format.parse({
                            value: rejoindate,
                            type: format.Type.DATE
                        });
                    }
                }
                return rejoindate || '';
            } catch (e) {
                log.error('Error in gettingleaverejoindate', e);
            }
        };

        const getEmployeeStatus = (empID) => {
            try {
                const result = [];
                const empStatusSQL = `SELECT * FROM employee WHERE id = ${empID} AND isinactive = 'F'`;
                log.debug('empStatusSQL', empStatusSQL);

                const records = getResult(empStatusSQL);

                if (records.length > 0) {
                    const rec = records[0];
                    result.push({
                        empStatus: rec.custentity_emp_employee_job_status,
                        empJoinDate: rec.hiredate
                    });
                }
                return result;
            } catch (e) {
                log.error('Error in getEmployeeStatus', e);
            }
        };

        const getcompoffdate = (ValidtillDate, EmployeeName) => {
            let Compoff_Date = '';
            const compoffsql = `SELECT * FROM customrecord_hris_lve_raise_comp_off 
                                WHERE custrecord_hris_rcomp_employee_name = '${EmployeeName}' 
                                  AND custrecord_hris_rcomp_valid_till_date = '${ValidtillDate}'
                                  AND custrecord_hris_rcomp_appstatus = 2 
                                  AND custrecord_hris_rcomp_checked = 'F' 
                                  AND isinactive = 'F'`;
            log.debug('compoffsql', compoffsql);

            const queryResult = query.runSuiteQL({ query: compoffsql });
            const compoffsqlrecords = queryResult.asMappedResults();

            if (compoffsqlrecords.length > 0) {
                Compoff_Date = compoffsqlrecords[0].custrecord_hris_rcomp_comp_off_from_date || '';
            }
            return Compoff_Date;
        };

        const getcompoffvalidtilldate = (EmployeeName) => {
            let Compoff_Date = '';
            let Compoff_Type = '';

            const compoffsql = `SELECT * FROM customrecord_hris_lve_raise_comp_off 
                                WHERE custrecord_hris_rcomp_employee_name = '${EmployeeName}' 
                                  AND custrecord_hris_rcomp_appstatus = 2 
                                  AND custrecord_hris_rcomp_checked = 'F' 
                                  AND isinactive = 'F'`;
            log.debug('compoffsql', compoffsql);

            const queryResult = query.runSuiteQL({ query: compoffsql });
            const compoffsqlrecords = queryResult.asMappedResults();

            if (compoffsqlrecords.length > 0) {
                Compoff_Date = compoffsqlrecords[0].custrecord_hris_rcomp_valid_till_date || '';
                Compoff_Type = compoffsqlrecords[0].custrecord_hris_rcomp_compofftype || '';
            }
            return `${Compoff_Date}#${Compoff_Type}`;
        };

        const getEmployeeOBDetails = (empInternalId, leavetype) => {
            try {
                const result = [];
                const leaveobbalancesql = `SELECT * FROM customrecord_hris_leavebalance 
                                           WHERE custrecord_hris_lvbal_employee_name = '${empInternalId}' 
                                             AND custrecord_hris_lvbal_leave_type = '${leavetype}' 
                                             AND isinactive = 'F'
                                             AND custrecord_hris_lvbal_openingbalance IS NOT NULL`;
                log.debug('leaveobbalancesql', leaveobbalancesql);

                const queryResult = query.runSuiteQL({ query: leaveobbalancesql });
                const leaveobbalancesqlrecords = queryResult.asMappedResults();

                if (leaveobbalancesqlrecords.length > 0) {
                    result.push({
                        obdate: leaveobbalancesqlrecords[0].custrecord_hris_lvbal_obdate || '',
                        obleavebalance: leaveobbalancesqlrecords[0].custrecord_hris_lvbal_openingbalance || 0
                    });
                }
                return result;
            } catch (e) {
                log.error('Error in getEmployeeOBDetails', e);
            }
        };

        const getvalidations = (LeaveTYPE) => {
            const leavesequencesql = `SELECT * FROM customrecord_hris_leaveconfig WHERE id = '${LeaveTYPE}' AND isinactive = 'F'`;
            log.debug('leavesequencesql', leavesequencesql);

            const queryResult = query.runSuiteQL({ query: leavesequencesql });
            const leavesequencesqlrecords = queryResult.asMappedResults();

            if (leavesequencesqlrecords.length > 0) {
                const LC_CarryFwdCheck = leavesequencesqlrecords[0].custrecord_hris_lveconfig_levcarryforwrd;
                const LC_CarryFwddays = leavesequencesqlrecords[0].custrecord_hris_lvecfg_nextyrleaveapply;
                return `${LC_CarryFwdCheck},${LC_CarryFwddays}`;
            }
            return 'F,0';
        };

        const getmonthno = (Cal_Endmonth) => {
            const months = {
                'January': '0', 'February': '1', 'March': '2', 'April': '3',
                'May': '4', 'June': '5', 'July': '6', 'August': '7',
                'September': '8', 'October': '9', 'November': '10', 'December': '11'
            };
            return months[Cal_Endmonth] || '0';
        };

        const saveRecord = (scriptContext) => {
             debugger;
            try {
                const leaverecord = scriptContext.currentRecord;
                const Leave_Encashment = leaverecord.getValue('custrecord_hris_lve_applylveencashment');

                if (Leave_Encashment === false) {
                    let date = leaverecord.getValue('custrecord_hris_lve_fromdate');
                    if (date) {
                        date = format.parse({ value: date, type: format.Type.DATE });
                        const month = date.getMonth() + 1;
                        const year = date.getFullYear();
                        leaverecord.setValue('custrecord_hris_lva_year', year, true, true);
                        leaverecord.setValue('custrecord_hris_lve_month', month, true, true);
                    }
                }

                // Comp-off validation
                const leave_type = leaverecord.getValue('custrecord_hris_lve_leavetype');
                if (leave_type) {
                    const EmployeeName = leaverecord.getValue('custrecord_hris_lve_employeename');
                    let fromDATE = leaverecord.getValue('custrecord_hris_lve_fromdate');
                    const SequenceNo = get_sequence_no(leave_type);

                    if (SequenceNo == '5') {
                        let ValidtillDate = leaverecord.getValue('custrecord_hris_lve_validtilldate');
                        ValidtillDate = moment(ValidtillDate).format('DD/MM/YYYY');

                        let compoffDATE = getcompoffdate(ValidtillDate, EmployeeName);

                        if (compoffDATE) {
                            compoffDATE = format.parse({ value: compoffDATE, type: format.Type.DATE });
                            fromDATE = format.parse({ value: fromDATE, type: format.Type.DATE });

                            if (fromDATE < compoffDATE) {
                                alert('You can not apply leave on before date of raise compoff date');
                                return false;
                            }
                        }
                    }
                }

                // Leave Year / Carry Forward validation
                const FromDate = leaverecord.getValue('custrecord_hris_lve_fromdate');
                const ToDate = leaverecord.getValue('custrecord_hris_lve_todate');
                const LeaveTYPE = leaverecord.getValue('custrecord_hris_lve_leavetype');
                const LeaveTYPE_text = leaverecord.getText('custrecord_hris_lve_leavetype');

                if (FromDate && ToDate) {
                    const FromDate_STRING = format.parse({ value: FromDate, type: format.Type.DATE });
                    const FromDate_YEAR = FromDate_STRING.getFullYear();

                    const ToDate_STRING = format.parse({ value: ToDate, type: format.Type.DATE });
                    const ToDate_YEAR = ToDate_STRING.getFullYear();

                    const CalenderYear_Record = record.load({
                        type: 'customrecord_hris_leave_calender_year',
                        id: 1,
                        isDynamic: true
                    });

                    let Cal_StartYear = CalenderYear_Record.getValue('custrecord_hris_lvecalyr_startyr');
                    let Cal_EndYear = CalenderYear_Record.getValue('custrecord_hris_lvecalyr_endyr');
                    const Cal_Endmonth = CalenderYear_Record.getValue('custrecord_hris_lvecalyr_endmth');
                    const Cal_StartYear_String = CalenderYear_Record.getText('custrecord_hris_lvecalyr_startyr');
                    const Cal_EndYear_String = CalenderYear_Record.getText('custrecord_hris_lvecalyr_endyr');

                    const monthNo = getmonthno(Cal_Endmonth);
                    let leavetypeSettings = getvalidations(LeaveTYPE);
                    leavetypeSettings = leavetypeSettings.split(',');
                    const carryforwardCHECK = leavetypeSettings[0];
                    let carryforwardDAYS = leavetypeSettings[1];

                    if (ToDate_YEAR > Cal_StartYear_String || ToDate_YEAR > Cal_EndYear_String) {
                        if (carryforwardCHECK == 'T') {
                            carryforwardDAYS = parseInt(carryforwardDAYS, 10) || 0;

                            if (carryforwardDAYS !== 0) {
                                Cal_EndYear = parseInt(Cal_EndYear, 10);
                                const monthNoInt = parseInt(monthNo, 10);

                                const lastDay = new Date(Cal_EndYear, monthNoInt + 1, 0);
                                const LastCarryFwd_DATE = moment(lastDay).add(carryforwardDAYS, 'days').format('DD/MM/YYYY');

                                if (FromDate_STRING > LastCarryFwd_DATE || ToDate_STRING > LastCarryFwd_DATE) {
                                    alert(`You can apply ${LeaveTYPE_text} for next year within ${carryforwardDAYS} Days.`);
                                    leaverecord.setValue('custrecord_hris_lve_todate', '', false);
                                    leaverecord.setValue('custrecord_hris_lve_fromdate', '', false);
                                    leaverecord.setValue('custrecord_hris_lve_leavetype', '', false);
                                    leaverecord.setValue('custrecord_hris_lve_leavebalance', '', false);
                                    leaverecord.setValue('custrecord_hris_lve_totalnodays', '', false);
                                    return false;
                                }
                            }
                        }

                        if (carryforwardCHECK == 'F') {
                            if ((FromDate_YEAR > Cal_StartYear_String && FromDate_YEAR > Cal_EndYear_String) ||
                                (ToDate_YEAR > Cal_StartYear_String && ToDate_YEAR > Cal_EndYear_String)) {
                                alert(`You cannot Apply ${LeaveTYPE_text} for Next Year`);
                                leaverecord.setValue('custrecord_hris_lve_todate', '', false);
                                leaverecord.setValue('custrecord_hris_lve_fromdate', '', false);
                                leaverecord.setValue('custrecord_hris_lve_leavetype', '', false);
                                leaverecord.setValue('custrecord_hris_lve_leavebalance', '', false);
                                leaverecord.setValue('custrecord_hris_lve_totalnodays', '', false);
                                return false;
                            }
                        }
                    }
                }

                return true;
            } catch (e) {
                console.log(`error in saverecord : ${e}`);
            }
        };

        const getResult = (pSQL) => {
            const queryResults = query.runSuiteQL({ query: pSQL });
            return queryResults.asMappedResults();
        };

        return {
            pageInit,
            saveRecord,
            fieldChanged
        };
    });

// Utility function kept outside (same as original)
function _logValidation(value) {
    if (value != null && value !== '' && value != undefined && value.toString() != 'NaN' && value != NaN) {
        return true;
    }
    return false;
}