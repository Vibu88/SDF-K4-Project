/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope Public
 *
 * Development HR Attendance Summary Report (Overall Timesheet & Leave Integration)
 * Theme: Navy Blue (#1e3a5f)
 * Features:
 *  - Monthly / Period Attendance Summary (one row per employee).
 *  - Data Source: customrecord_hris_daily_timesheet_overal and customrecord_hris_leaveapplication
 *    (same data source and day-status logic as the Attendance Portal reference script).
 *  - Filters (same design as reference): Subsidiary, Start Date, End Date.
 *  - Regularize Present (RP) logic when Reg In and Reg Out have values.
 *  - Weekly Off (WO) check from employee record (custentity_hris_empweeklyoffs).
 *  - Public Holiday (PH) check from holiday master (customrecord_hris_holiday_master / custrecord_hris_holiday_date).
 *  - Leave Application check from customrecord_hris_leaveapplication with approval status = 2 and cancellation = false.
 *  - Paid / Unpaid leave count from leave config (customrecord_hris_leaveconfig / custrecord_hris_lveconfig_unpaid):
 *      Paid leave   -> counted in Present
 *      Unpaid leave -> counted in Absent
 *  - Swipe Missing (SM) detection when In Time equals Out Time.
 *  - Aggregated Work Hours and OT Hours per employee.
 *  - Excel Export of the summary.
 *  - FILTERED: Strictly by Subsidiary, Start Date, and End Date.
 */

define(["N/ui/serverWidget", "N/log", "N/query", "N/runtime", "N/url", "N/file"],
function (serverWidget, log, query, runtime, url, file) {

    function onRequest(context) {
        var p = context.request.parameters;
        var subId = p.custpage_subsidiary || '';
        var startStr = p.custpage_startdate || '';
        var endStr = p.custpage_enddate || '';
        var isExp = (p.custpage_export === 'T');

        // Logic: Build date range from header inputs
        var dr = null;
        if (startStr && endStr) {
            dr = buildDateRange(startStr, endStr);
        }

        /* =========================================================
           EXCEL EXPORT LOGIC
        ========================================================= */
        if (isExp && subId && dr) {
            var expData = getAttendanceData(subId, dr);
            var htmlTable = buildExcelHtml(expData, dr);

            var excelFile = file.create({
                name: 'Development_Attendance_Summary_Report.xls',
                fileType: file.Type.PLAINTEXT,
                contents: htmlTable
            });

            context.response.writeFile({ file: excelFile });
            return;
        }

        /* =========================================================
           PAGE RENDER LOGIC
        ========================================================= */
        var form = serverWidget.createForm({ title: ' ' });

        if (subId && dr) {
            var ad = getAttendanceData(subId, dr);
            var f  = form.addField({ id:'custpage_html', type:serverWidget.FieldType.INLINEHTML, label:' ' });
            f.defaultValue = buildSummaryHtml(ad, dr, subId, startStr, endStr);
        } else {
            var fi = form.addField({ id:'custpage_info', type:serverWidget.FieldType.INLINEHTML, label:' ' });
            fi.defaultValue = getStyles() + buildHeader(subId, startStr, endStr) +
                '<div class="welcome-msg">Select Subsidiary, Start Date, and End Date to load the Attendance Summary Report.</div>';
        }
        context.response.writePage(form);
    }

    function buildDateRange(startStr, endStr) {
        var sParts = startStr.split('-');
        var eParts = endStr.split('-');

        var start = new Date(parseInt(sParts[0], 10), parseInt(sParts[1], 10) - 1, parseInt(sParts[2], 10));
        var end   = new Date(parseInt(eParts[0], 10), parseInt(eParts[1], 10) - 1, parseInt(eParts[2], 10));

        var days  = [], t = new Date(start);
        while (t <= end) {
            days.push(new Date(t));
            t.setDate(t.getDate() + 1);
        }
        return { start: start, end: end, days: days };
    }

    function toMins(str) {
        if (!str || str === '-' || str === '00:00' || str === '0') return 0;
        if (str.indexOf(':') === -1) {
            var hrs = parseFloat(str);
            return isNaN(hrs) ? 0 : Math.round(hrs * 60);
        }
        var p = str.split(':');
        return parseInt(p[0] || 0, 10) * 60 + parseInt(p[1] || 0, 10);
    }

    function minsToHHMM(mins) {
        if (!mins || mins <= 0) return '00:00';
        var h = Math.floor(mins / 60);
        var m = mins % 60;
        return (h < 10 ? '0' + h : h) + ':' + (m < 10 ? '0' + m : m);
    }

    function getLeaveCode(leaveTypeName) {
        if (!leaveTypeName) return 'L';
        var lt = leaveTypeName.toLowerCase();
        if (lt.indexOf('annual') !== -1) return 'AL';
        if (lt.indexOf('sick') !== -1) return 'SL';
        if (lt.indexOf('casual') !== -1) return 'CL';
        if (lt.indexOf('maternity') !== -1) return 'ML';
        if (lt.indexOf('paternity') !== -1) return 'PL';
        if (lt.indexOf('compensatory') !== -1 || lt.indexOf('comp') !== -1) return 'CO';
        if (lt.indexOf('bereavement') !== -1) return 'BL';
        if (lt.indexOf('unpaid') !== -1) return 'UL';
        if (lt.indexOf('half') !== -1) return 'HL';
        if (lt.indexOf('vacation') !== -1) return 'VL';
        return leaveTypeName.substring(0, 2).toUpperCase();
    }

    function getTypeMapping() {
        return {
            '1':  { code: 'A',   cls: 'c-a'  },
            '2':  { code: 'BL',  cls: 'c-l'  },
            '3':  { code: 'CO',  cls: 'c-l'  },
            '4':  { code: 'EMR', cls: 'c-l'  },
            '5':  { code: 'AL',  cls: 'c-l'  },
            '6':  { code: 'AL',  cls: 'c-l'  },
            '7':  { code: 'AL',  cls: 'c-l'  },
            '8':  { code: 'CL',  cls: 'c-l'  },
            '9':  { code: 'CO',  cls: 'c-l'  },
            '10': { code: 'HL',  cls: 'c-l'  },
            '11': { code: 'ML',  cls: 'c-l'  },
            '12': { code: 'ML',  cls: 'c-l'  },
            '13': { code: 'PL',  cls: 'c-l'  },
            '14': { code: 'SL',  cls: 'c-l'  },
            '15': { code: 'SL',  cls: 'c-l'  },
            '16': { code: 'SL',  cls: 'c-l'  },
            '17': { code: 'UL',  cls: 'c-a'  },
            '18': { code: 'P',   cls: 'c-p'  },
            '19': { code: 'PH',  cls: 'c-h'  },
            '20': { code: 'VL',  cls: 'c-l'  },
            '21': { code: 'WO',  cls: 'c-wo' },
            '22': { code: 'NA',  cls: 'c-na' },
            '23': { code: 'NA',  cls: 'c-na' },
            'RP': { code: 'RP',  cls: 'c-rp' },
            'P':  { code: 'P',   cls: 'c-p'  },
            'A':  { code: 'A',   cls: 'c-a'  },
            'WO': { code: 'WO',  cls: 'c-wo' },
            'PH': { code: 'PH',  cls: 'c-h'  },
            'SM': { code: 'SM',  cls: 'c-sm' },
            'AL': { code: 'AL',  cls: 'c-l'  },
            'SL': { code: 'SL',  cls: 'c-l'  },
            'CL': { code: 'CL',  cls: 'c-l'  },
            'ML': { code: 'ML',  cls: 'c-l'  },
            'PL': { code: 'PL',  cls: 'c-l'  },
            'CO': { code: 'CO',  cls: 'c-l'  },
            'BL': { code: 'BL',  cls: 'c-l'  },
            'UL': { code: 'UL',  cls: 'c-a'  },
            'HL': { code: 'HL',  cls: 'c-l'  },
            'VL': { code: 'VL',  cls: 'c-l'  }
        };
    }

    function getAttendanceData(subId, dr) {
        var typeMap = getTypeMapping();
        function fmt(d) { return (d.getDate()<10?'0'+d.getDate():d.getDate())+'/'+((d.getMonth()+1)<10?'0'+(d.getMonth()+1):(d.getMonth()+1))+'/'+d.getFullYear(); }

        var sql = "SELECT A.custrecord_hris_daily_time_over_emp AS emp_id, " +
                  "BUILTIN.DF(A.custrecord_hris_daily_time_over_emp) AS emp_name, " +
                  "C.custentity_hris_empcode AS emp_code, " +
                  "TO_CHAR(A.custrecord_hris_dail_timeheet_date, 'DD/MM/YYYY') AS d_date, " +
                  "A.custrecord_hris_internal_attend_ove AS type_id, " +
                  "BUILTIN.DF(A.custrecord_hris_internal_attend_ove) AS type_name, " +
                  "A.custrecord_hris_daily_intime_overal AS in_time, " +
                  "A.custrecord_hris_daily_time_out_overa AS out_time, " +
                  "A.custrecord_hris_reg_time_overallin AS reg_in, " +
                  "A.custrecord_hris_regout_overall AS reg_out, " +
                  "A.custrecord_hris_daily_time_workinghours AS working_hours, " +
                  "A.custrecord_hris_daily_time_total_hr AS total_hours, " +
                  "A.custrecord_hris_dailytime_actaul_wor AS actual_working_hours, " +
                  "A.custrecord_hris_actual_whr_overall AS actual_hours_total, " +
                  "A.custrecord_hris_dailytime_othoursoverall AS ot_hours, " +
                  "BUILTIN.DF(A.custrecord_hris_daily_time_projectoveral) AS proj_name, " +
                  "BUILTIN.DF(C.custentity_hris_empdesignation) AS design, " +
                  "BUILTIN.DF(C.custentity_hris_empdepartment_new) AS dept, " +
                  "BUILTIN.DF(C.custentity_hris_empweeklyoffs) AS weekly_offs, " +
                  "C.custentity_hris_empholidays AS emp_holiday_id " +
                  "FROM customrecord_hris_daily_timesheet_overal AS A " +
                  "JOIN employee AS C ON A.custrecord_hris_daily_time_over_emp = C.id " +
                  "WHERE C.subsidiary = ? AND A.custrecord_hris_dail_timeheet_date BETWEEN TO_DATE(?, 'DD/MM/YYYY') AND TO_DATE(?, 'DD/MM/YYYY') " +
                  "ORDER BY emp_name";

        var results = query.runSuiteQL({ query: sql, params: [subId, fmt(dr.start), fmt(dr.end)] }).asMappedResults();

        // Fetch Leave Applications from customrecord_hris_leaveapplication where status is 2 and cancellation is false
        // Joined with leave config record: attendance type mapping (custrecord_hris_lveattntype) and unpaid flag (custrecord_hris_lveconfig_unpaid)
        var leaveSql = "SELECT L.custrecord_hris_lve_employeename AS emp_id, " +
                       "TO_CHAR(L.custrecord_hris_lve_fromdate, 'DD/MM/YYYY') AS from_date, " +
                       "TO_CHAR(L.custrecord_hris_lve_todate, 'DD/MM/YYYY') AS to_date, " +
                       "BUILTIN.DF(L.custrecord_hris_lve_leavetype) AS leave_type, " +
                       "CFG.custrecord_hris_lveattntype AS attn_type_id, " +
                       "CFG.custrecord_hris_lveconfig_unpaid AS is_unpaid " +
                       "FROM customrecord_hris_leaveapplication AS L " +
                       "LEFT JOIN customrecord_hris_leaveconfig AS CFG ON L.custrecord_hris_lve_leavetype = CFG.id " +
                       "WHERE L.custrecord_hris_lve_hrmsapprovalstatus = 2 AND L.custrecord_hris_lve_cancellation = 'F' " +
                       "AND L.custrecord_hris_lve_fromdate <= TO_DATE(?, 'DD/MM/YYYY') AND L.custrecord_hris_lve_todate >= TO_DATE(?, 'DD/MM/YYYY')";

        var leaveResults = [];
        try {
            leaveResults = query.runSuiteQL({ query: leaveSql, params: [fmt(dr.end), fmt(dr.start)] }).asMappedResults();
        } catch (e) {
            log.error({ title: 'Leave Application Query Error', details: e.message });
        }

        var leaveMap = {};
        var leaveUnpaidMap = {};
        leaveResults.forEach(function(lr) {
            var sParts = lr.from_date.split('/');
            var eParts = lr.to_date.split('/');
            var curDate = new Date(parseInt(sParts[2], 10), parseInt(sParts[1], 10) - 1, parseInt(sParts[0], 10));
            var endDate = new Date(parseInt(eParts[2], 10), parseInt(eParts[1], 10) - 1, parseInt(eParts[0], 10));

            while (curDate <= endDate) {
                var dStr = (curDate.getDate()<10?'0'+curDate.getDate():curDate.getDate())+'/'+((curDate.getMonth()+1)<10?'0'+(curDate.getMonth()+1):(curDate.getMonth()+1))+'/'+curDate.getFullYear();
                var lKey = lr.emp_id + '_' + dStr;
                var rawLeaveType = lr.leave_type || 'Leave';
                // Attendance type id from leave config (e.g. 5 = AL, 14 = SL); fallback to leave type name code
                leaveMap[lKey] = lr.attn_type_id ? String(lr.attn_type_id) : getLeaveCode(rawLeaveType);
                leaveUnpaidMap[lKey] = (lr.is_unpaid === 'T' || lr.is_unpaid === true);
                curDate.setDate(curDate.getDate() + 1);
            }
        });

        // Fetch Public Holidays from customrecord_hris_holiday_master
        var holidaySql = "SELECT TO_CHAR(custrecord_hris_holiday_date, 'DD/MM/YYYY') AS h_date FROM customrecord_hris_holiday_master WHERE custrecord_hris_holiday_date BETWEEN TO_DATE(?, 'DD/MM/YYYY') AND TO_DATE(?, 'DD/MM/YYYY')";
        var holidayResults = [];
        try {
            holidayResults = query.runSuiteQL({ query: holidaySql, params: [fmt(dr.start), fmt(dr.end)] }).asMappedResults();
        } catch (e) {
            log.error({ title: 'Holiday Master Query Error', details: e.message });
        }

        var holidayMap = {};
        holidayResults.forEach(function(hr) {
            if (hr.h_date) {
                holidayMap[hr.h_date] = true;
            }
        });

        // Group rows by employee and date
        var dateGroupMap = {};
        results.forEach(function (row) {
            var key = row.emp_id + '_' + row.d_date;
            if (!dateGroupMap[key]) {
                dateGroupMap[key] = {
                    emp_id: row.emp_id,
                    emp_name: row.emp_name,
                    emp_code: row.emp_code,
                    design: row.design,
                    dept: row.dept,
                    weekly_offs: row.weekly_offs || '',
                    d_date: row.d_date,
                    rows: []
                };
            }
            dateGroupMap[key].rows.push(row);
        });

        var dataMap = {};
        var empOrder = [];
        var stats = { total: 0, p: 0, a: 0, l: 0, sm: 0, pl: 0, ul: 0, off: 0, workMins: 0, otMins: 0 };

        for (var k in dateGroupMap) {
            var group = dateGroupMap[k];
            var empName = group.emp_name;

            if (!dataMap[empName]) {
                dataMap[empName] = {
                    code: group.emp_code || '-', design: group.design || '-', department: group.dept || '-',
                    att: {}, workHrs: {}, otHrs: {}, inTime: {}, outTime: {}, regIn: {}, regOut: {}, projects: {},
                    countP: 0, countA: 0, countL: 0, countPL: 0, countUL: 0, countHD: 0, countOff: 0, countSM: 0, totalWorkMins: 0, totalOTMins: 0
                };
                empOrder.push(empName);
            }

            var emp = dataMap[empName];
            var ds = group.d_date;
            var rows = group.rows;

            var dParts = ds.split('/');
            var dateObj = new Date(parseInt(dParts[2], 10), parseInt(dParts[1], 10) - 1, parseInt(dParts[0], 10));
            var dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            var currentDayName = dayNames[dateObj.getDay()];

            var totalWorkMinsForDate = 0;
            var totalOTMinsForDate = 0;
            var earliestInTime = null;
            var latestOutTime = null;
            var regInVal = '-';
            var regOutVal = '-';
            var projectList = [];
            var determinedType = null;

            rows.forEach(function (row) {
                var wMins = toMins(row.total_hours || row.working_hours);
                var oMins = toMins(row.ot_hours);
                totalWorkMinsForDate += wMins;
                totalOTMinsForDate += oMins;

                if (row.in_time && row.in_time !== '-') {
                    if (!earliestInTime) earliestInTime = row.in_time;
                }
                if (row.out_time && row.out_time !== '-') {
                    latestOutTime = row.out_time;
                }

                if (row.reg_in && row.reg_in !== '-') {
                    regInVal = row.reg_in;
                }
                if (row.reg_out && row.reg_out !== '-') {
                    regOutVal = row.reg_out;
                }

                var pName = row.proj_name || '';
                var shortP = pName ? pName.split(' ')[0] : '';
                if (shortP && shortP !== '-' && projectList.indexOf(shortP) === -1) {
                    projectList.push(shortP);
                }

                if (row.type_id && !determinedType) {
                    determinedType = String(row.type_id);
                }
            });

            var leaveKey = group.emp_id + '_' + ds;
            var isWeeklyOff = group.weekly_offs && group.weekly_offs.indexOf(currentDayName) !== -1;
            var isHoliday = holidayMap[ds] ? true : false;

            if (leaveMap[leaveKey]) {
                determinedType = leaveMap[leaveKey];
            } else if (isHoliday) {
                determinedType = '19'; // PH - Public Holiday
            } else if (isWeeklyOff) {
                determinedType = '21'; // WO - Weekly Off
            } else if (regInVal !== '-' && regOutVal !== '-') {
                determinedType = 'RP'; // Regularize Present
            } else if (earliestInTime && latestOutTime && earliestInTime === latestOutTime) {
                determinedType = '24'; // Swipe Missing
            } else if (!determinedType || determinedType === '-') {
                determinedType = '18'; // Present
            }

            emp.att[ds] = determinedType;
            emp.workHrs[ds] = minsToHHMM(totalWorkMinsForDate);
            emp.otHrs[ds] = minsToHHMM(totalOTMinsForDate);
            emp.inTime[ds] = earliestInTime || '-';
            emp.outTime[ds] = latestOutTime || '-';
            emp.regIn[ds] = regInVal;
            emp.regOut[ds] = regOutVal;
            emp.projects[ds] = projectList.length > 0 ? projectList.join(', ') : '-';

            emp.totalWorkMins += totalWorkMinsForDate;
            emp.totalOTMins += totalOTMinsForDate;

            var info = typeMap[determinedType];
            if (!emp._countedDates) emp._countedDates = {};
            if (!emp._countedDates[ds]) {
                emp._countedDates[ds] = true;
                if (leaveMap[leaveKey] || (info && info.cls === 'c-l')) {
                    stats.l++; emp.countL++;
                    if (leaveMap[leaveKey]) {
                        if (leaveUnpaidMap[leaveKey]) { stats.a++; emp.countA++; stats.ul++; emp.countUL++; }
                        else { stats.p++; emp.countP++; stats.pl++; emp.countPL++; }
                    }
                } else if (determinedType === '18' || determinedType === 'RP' || (info && info.code === 'P')) {
                    stats.p++; emp.countP++;
                } else if (determinedType === '24') {
                    stats.sm++; emp.countSM++;
                } else if (determinedType === '1' || determinedType === '17' || (info && info.code === 'A')) {
                    stats.a++; emp.countA++;
                } else if (info && (info.code === 'WO' || info.code === 'PH')) {
                    emp.countOff++; stats.off++;
                } else {
                    stats.p++; emp.countP++;
                }
            }
        }

        // Leave days that have NO timesheet record: take the leave type from the approved leave application
        var empIdByName = {};
        for (var gk in dateGroupMap) {
            empIdByName[dateGroupMap[gk].emp_name] = dateGroupMap[gk].emp_id;
        }
        empOrder.forEach(function (nm) {
            var lEmp = dataMap[nm];
            var lEmpId = empIdByName[nm];
            dr.days.forEach(function (day) {
                var lds = (day.getDate()<10?'0'+day.getDate():day.getDate())+'/'+((day.getMonth()+1)<10?'0'+(day.getMonth()+1):(day.getMonth()+1))+'/'+day.getFullYear();
                var lKey2 = lEmpId + '_' + lds;
                if (!lEmp.att[lds] && leaveMap[lKey2]) {
                    lEmp.att[lds] = leaveMap[lKey2];
                    lEmp.workHrs[lds] = '00:00';
                    lEmp.otHrs[lds] = '00:00';
                    lEmp.inTime[lds] = '-';
                    lEmp.outTime[lds] = '-';
                    lEmp.regIn[lds] = '-';
                    lEmp.regOut[lds] = '-';
                    lEmp.projects[lds] = '-';
                    if (!lEmp._countedDates) lEmp._countedDates = {};
                    if (!lEmp._countedDates[lds]) {
                        lEmp._countedDates[lds] = true;
                        stats.l++; lEmp.countL++;
                        if (leaveUnpaidMap[lKey2]) { stats.a++; lEmp.countA++; stats.ul++; lEmp.countUL++; }
                        else { stats.p++; lEmp.countP++; stats.pl++; lEmp.countPL++; }
                    }
                }
            });
        });

        // Totals of work hours and OT hours for KPI cards
        empOrder.forEach(function (nm) {
            stats.workMins += dataMap[nm].totalWorkMins;
            stats.otMins += dataMap[nm].totalOTMins;
        });

        stats.total = empOrder.length;
        return { dataMap: dataMap, empOrder: empOrder, stats: stats, typeMapping: typeMap };
    }

    function buildSummaryHtml(data, dr, subId, startStr, endStr) {
        var html = getStyles() + buildHeader(subId, startStr, endStr);

        var iconEmp = '<div class="c-ico c-ico-emp"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg></div>';
        var iconPrs = '<div class="c-ico c-ico-prs"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>';
        var iconAbs = '<div class="c-ico c-ico-abs"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></div>';
        var iconLve = '<div class="c-ico c-ico-lve"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line></svg></div>';
        var iconSm  = '<div class="c-ico c-ico-abs" style="background:#fff7ed; color:#ea580c;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12" y2="16"></line></svg></div>';

        html += '<div class="kpi-bar">' +
            makeKpiCard('Total Employees', data.stats.total, iconEmp) +
            makeKpiCard('Total Present', data.stats.p, iconPrs) +
            makeKpiCard('Absent / Unpaid', data.stats.a, iconAbs) +
            makeKpiCard('Swipe Missing', data.stats.sm, iconSm) +
            makeKpiCard('Leave Days', data.stats.l, iconLve) +
            makeKpiCard('Paid Leave', data.stats.pl, iconPrs) +
            makeKpiCard('Unpaid Leave', data.stats.ul, iconAbs) +
            '</div>';

        var range = dr.start.toDateString().slice(4) + ' – ' + dr.end.toDateString().slice(4);
        html += '<div class="toolbar">' +
            '<div class="t-left"><span class="pill">' + range.toUpperCase() + '</span>' +
            '<div class="search-box"><span>🔍</span><input type="text" id="attSearch" placeholder="Search name or code..." onkeyup="filterTable()"></div></div>' +
            '<div class="t-right"><button class="btn-exp" onclick="triggerExcelExport()">⇓ Export to Excel</button></div>' +
            '</div>';

        html += '<div class="legend"><span class="leg-lbl">Note:</span>' +
            '<span class="leg-i"><span class="badge c-p">Present</span> Present + RP + Paid Leave</span>' +
            '<span class="leg-i"><span class="badge c-a">Absent</span> Absent + Unpaid Leave</span>' +
            '<span class="leg-i"><span class="badge c-l">Leave</span> Paid + Unpaid Leave Days</span>' +
            '<span class="leg-i"><span class="badge c-sm">SM</span> Swipe Missing</span>' +
            '<span class="leg-i"><span class="badge c-wo">OFF</span> Weekly Off + Holiday</span></div>';

        html += '<div class="tbl-wrap"><div class="tbl-scroll"><table id="attTable"><thead>';

        html += '<tr>' +
            '<th class="sm-code">CODE</th>' +
            '<th class="sm-name">NAME</th>' +
            '<th class="sm-desig">DESIGNATION</th>' +
            '<th class="sm-dept">DEPARTMENT</th>' +
            '<th class="sh">TOTAL<br>DAYS</th>' +
            '<th class="sh">Present</th>' +
            '<th class="sh">Absent</th>' +
            '<th class="sh">Leave</th>' +
            '<th class="sh">Paid<br>Leave</th>' +
            '<th class="sh">Unpaid<br>Leave</th>' +
            '<th class="sh">SM</th>' +
            '<th class="sh">HalfDay</th>' +
            '<th class="sh">OFF</th>' +
            '<th class="sh">WORK<br>HRS</th>' +
            '<th class="sh">OT<br>HRS</th></tr>';

        html += '</thead><tbody id="attBody">';

        data.empOrder.forEach(function (name, idx) {
            var emp = data.dataMap[name];
            var rgc = (idx % 2 === 0) ? 'rg-e' : 'rg-o';
            var rowAttr = 'data-emp="' + name.toUpperCase() + ' ' + emp.code + '"';

            html += '<tr class="' + rgc + '" ' + rowAttr + '>' +
                '<td class="sm-cell sm-code-v ' + rgc + '">' + emp.code + '</td>' +
                '<td class="sm-cell sm-name-v ' + rgc + '"><b>' + name + '</b></td>' +
                '<td class="sm-cell ' + rgc + '"><span class="desig-txt">' + emp.design + '</span></td>' +
                '<td class="sm-cell ' + rgc + '">' + emp.department + '</td>' +
                '<td class="sc">' + dr.days.length + '</td>' +
                '<td class="sc sn-p">' + emp.countP + '</td>' +
                '<td class="sc sn-a">' + emp.countA + '</td>' +
                '<td class="sc sn-l">' + emp.countL + '</td>' +
                '<td class="sc sn-p">' + emp.countPL + '</td>' +
                '<td class="sc sn-a">' + emp.countUL + '</td>' +
                '<td class="sc sn-sm" style="color:#ea580c;">' + emp.countSM + '</td>' +
                '<td class="sc sn-hd">' + emp.countHD + '</td>' +
                '<td class="sc sn-of">' + emp.countOff + '</td>' +
                '<td class="sc wh-v-txt">' + minsToHHMM(emp.totalWorkMins) + '</td>' +
                '<td class="sc ot-v-txt">' + minsToHHMM(emp.totalOTMins) + '</td></tr>';
        });

        html += '</tbody></table></div></div>';

        html += '<script>' +
            'function triggerExcelExport() {' +
            '  var scriptId = "' + runtime.getCurrentScript().id + '";' +
            '  var deployId = "' + runtime.getCurrentScript().deploymentId + '";' +
            '  var sub = "' + subId + '"; var sd = "' + startStr + '"; var ed = "' + endStr + '";' +
            '  var url = "/app/site/hosting/scriptlet.nl?script=" + scriptId + "&deploy=" + deployId + "&custpage_subsidiary=" + sub + "&custpage_startdate=" + sd + "&custpage_enddate=" + ed + "&custpage_export=T";' +
            '  window.open(url, "_blank");' +
            '}' +
            'function filterTable(){' +
            '  var f = document.getElementById("attSearch").value.toUpperCase();' +
            '  var trs = document.getElementById("attBody").getElementsByTagName("tr");' +
            '  for(var i=0; i<trs.length; i++){' +
                'var txt = trs[i].getAttribute("data-emp");' +
                'if(txt) { trs[i].style.display = (txt.indexOf(f) > -1) ? "" : "none"; }' +
            '  }' +
            '}' +
            '</script>';

        return html;
    }

    function buildExcelHtml(data, dr) {
        var hSty = 'background-color:#1e3a5f; color:#ffffff; font-weight:bold; border:1px solid #ffffff; text-align:center; padding:10px 5px; height:35pt; vertical-align:middle; font-size:10pt;';
        var border = 'border:1px solid #e2e8f0;';

        var html = '<html><head><meta charset="utf-8"></head><body>';
        html += '<table border="1"><thead>';
        html += '<tr><td colspan="15" style="font-weight:bold; font-size:12pt; color:#1e3a5f; text-align:left;">Attendance Summary Report | ' +
                dr.start.toDateString().toUpperCase() + ' - ' + dr.end.toDateString().toUpperCase() + '</td></tr>';
        html += '<tr>';
        html += '<th style="' + hSty + '">CODE</th>';
        html += '<th style="' + hSty + '; width:220pt;">NAME</th>';
        html += '<th style="' + hSty + '; width:150pt;">DESIGNATION</th>';
        html += '<th style="' + hSty + '; width:110pt;">DEPARTMENT</th>';
        html += '<th style="' + hSty + '">TOTAL DAYS</th>';
        html += '<th style="' + hSty + '">Present</th>';
        html += '<th style="' + hSty + '">Absent</th>';
        html += '<th style="' + hSty + '">Leave</th>';
        html += '<th style="' + hSty + '">Paid Leave</th>';
        html += '<th style="' + hSty + '">Unpaid Leave</th>';
        html += '<th style="' + hSty + '">SM</th>';
        html += '<th style="' + hSty + '">HalfDay</th>';
        html += '<th style="' + hSty + '">OFF</th>';
        html += '<th style="' + hSty + '">WORK HRS</th>';
        html += '<th style="' + hSty + '">OT HRS</th>';
        html += '</tr></thead><tbody>';

        data.empOrder.forEach(function (name, idx) {
            var emp = data.dataMap[name];
            var rgc = (idx % 2 === 0) ? 'background-color:#ffffff;' : 'background-color:#f7f9ff;';
            var empCell = rgc + border + ' vertical-align:middle; padding:12px 5px; text-align:center; height:25pt;';

            html += '<tr>';
            html += '<td style="' + empCell + ' mso-number-format:\'\\@\';">' + emp.code + '</td>';
            html += '<td style="' + empCell + ' text-align:left; padding-left:12px;"><b>' + name + '</b></td>';
            html += '<td style="' + empCell + ' text-align:left; color:#0056a3;">' + emp.design + '</td>';
            html += '<td style="' + empCell + '">' + emp.department + '</td>';
            html += '<td style="' + empCell + ' font-weight:bold;">' + dr.days.length + '</td>';
            html += '<td style="' + empCell + ' font-weight:bold; color:#059669;">' + emp.countP + '</td>';
            html += '<td style="' + empCell + ' font-weight:bold; color:#dc2626;">' + emp.countA + '</td>';
            html += '<td style="' + empCell + ' font-weight:bold; color:#7e22ce;">' + emp.countL + '</td>';
            html += '<td style="' + empCell + ' font-weight:bold; color:#059669;">' + emp.countPL + '</td>';
            html += '<td style="' + empCell + ' font-weight:bold; color:#dc2626;">' + emp.countUL + '</td>';
            html += '<td style="' + empCell + ' font-weight:bold; color:#ea580c;">' + emp.countSM + '</td>';
            html += '<td style="' + empCell + ' font-weight:bold; color:#ea580c;">' + emp.countHD + '</td>';
            html += '<td style="' + empCell + ' font-weight:bold; color:#64748b;">' + emp.countOff + '</td>';
            html += '<td style="' + empCell + ' font-weight:bold; color:#1e40af; mso-number-format:\'\\@\';">' + minsToHHMM(emp.totalWorkMins) + '</td>';
            html += '<td style="' + empCell + ' font-weight:bold; color:#b45309; mso-number-format:\'\\@\';">' + minsToHHMM(emp.totalOTMins) + '</td>';
            html += '</tr>';
        });

        html += '</tbody></table></body></html>';
        return html;
    }

    function getStyles() {
        return '<style>' +
        '#div__titlebar, .uir-page-title { display:none !important; }' +
        '#custpage_html_val { padding:0 !important; }' +
        '.uir-content-wrapper { padding:0 !important; margin:0 !important; }' +
        '#main_form { margin:0 !important; }' +
        'body{margin:0; font-family:"Segoe UI", sans-serif; background:#f4f7f9;}' +
        '.pg-header{background:#1e3a5f; color:#fff; padding:10px 20px; display:flex; justify-content:space-between; align-items:center; position:sticky; top:0; z-index:1000; border-bottom:3px solid #38bdf8;}' +
        '.pg-header select, .pg-header input{background:#2d4878; color:#fff; border:1px solid #5070b0; padding:5px; border-radius:4px; margin-left:5px; font-size:12px; cursor:pointer;}' +
        '.kpi-bar{display:flex; background:#fff; position:sticky; top:45px; z-index:990; border-bottom:1px solid #e2e8f0;}' +
        '.kpi-card{flex:1; padding:12px 20px; display:flex; align-items:center; gap:15px; border-right:1px solid #f1f5f9;}' +
        '.c-ico{width:42px; height:42px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0;}' +
        '.c-ico-emp{background:#ede9fe; color:#5b21b6;}' +
        '.c-ico-prs{background:#d1fae5; color:#065f46;}' +
        '.c-ico-abs{background:#fee2e2; color:#991b1b;}' +
        '.c-ico-lve{background:#fef9c3; color:#78350f;}' +
        '.kpi-num{font-size:22px; font-weight:800; color:#1e293b; line-height:1;}' +
        '.kpi-lbl{font-size:11px; color:#64748b; margin-top:4px;}' +
        '.toolbar{padding:12px 20px; background:#fff; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0;}' +
        '.t-left{display:flex; align-items:center; gap:25px;}' +
        '.pill{background:#eff6ff; color:#1e40af; padding:5px 14px; border-radius:20px; font-size:11px; font-weight:700; border:1px solid #bfdbfe; white-space:nowrap;}' +
        '.search-box{position:relative; display:flex; align-items:center;}' +
        '.search-box input{padding:7px 10px 7px 35px !important; border:1px solid #cbd5e1; border-radius:6px; font-size:12px; width:220px; outline:none;}' +
        '.search-box span{position:absolute; left:12px; top:50%; transform:translateY(-50%); color:#94a3b8; font-size:13px; pointer-events:none; display:block;}' +
        '.btn-exp{background:#fff; color:#1e3a5f; border:1px solid #1e3a5f; padding:7px 15px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:600;}' +
        '.legend{padding:8px 20px; background:#f8fafc; border-bottom:1px solid #e2e8f0; font-size:11px; display:flex; gap:15px; align-items:center;}' +
        '.badge{padding:2px 4px; border-radius:3px; font-weight:800; color:#fff; min-width:20px; display:inline-block; text-align:center; font-size:9px;}' +
        '.tbl-wrap{margin:10px; background:#fff; border:1px solid #e2e8f0; border-radius:5px; overflow:hidden;}' +
        '.tbl-scroll{overflow:auto; max-height:70vh; scrollbar-width: auto;}' +
        '.tbl-scroll::-webkit-scrollbar { width: 10px; height: 10px; display: block !important; }' +
        '.tbl-scroll::-webkit-scrollbar-track { background: #f1f1f1; }' +
        '.tbl-scroll::-webkit-scrollbar-thumb { background: #1e3a5f; border-radius: 5px; }' +
        'table{border-collapse:separate; border-spacing:0; width:100%; table-layout: auto;}' +
        'thead th{background:#1e3a5f!important; color:#fff!important; font-size:10px; padding:10px 4px; text-align:center; border-right:1px solid #334b80; border-bottom:1px solid #334b80; position:sticky; top:0; z-index:500; box-sizing: border-box; height:34px;}' +
        '.sm-code{width:70px; min-width:70px;}' +
        '.sm-name{width:220px; min-width:220px; text-align:left!important; padding-left:10px!important;}' +
        '.sm-desig{width:160px; min-width:160px;}' +
        '.sm-dept{width:130px; min-width:130px;}' +
        '.sm-cell{padding:10px 8px; font-size:11px; border-right:1px solid #f1f5f9; border-bottom:1px solid #e2e8f0; vertical-align:middle;}' +
        '.sm-code-v{text-align:center; font-weight:700; color:#475569;}' +
        '.sm-name-v{text-align:left; color:#000;}' +
        '.rg-e{background:#fff;}' +
        '.rg-o{background:#f7f9ff;}' +
        'tbody tr:hover td{background-color:#eef4ff;}' +
        '.sh{width:60px; min-width:60px; background:#1e3a5f!important; color:#fff!important; font-size:9px; border-left:1px solid #334b80;}' +
        '.sc{width:60px; min-width:60px; text-align:center; font-weight:700; border-right:1px solid #e2e8f0; border-bottom:1px solid #e2e8f0; vertical-align:middle; font-size:11px; padding:8px 5px;}' +
        '.desig-txt{color:#0056a3; font-weight:normal; font-size:10px;}' +
        '.wh-v-txt{color:#1e40af; font-weight:700;}' +
        '.ot-v-txt{color:#b45309; font-weight:700;}' +
        '.sn-p{color:#059669; font-weight:800;}' +
        '.sn-a{color:#dc2626; font-weight:800;}' +
        '.sn-l{color:#7e22ce; font-weight:800;}' +
        '.sn-hd{color:#ea580c; font-weight:800;}' +
        '.sn-of{color:#64748b; font-weight:800;}' +
        '.c-p{background:#22c55e;}' +
        '.c-rp{background:#059669;}' +
        '.c-a{background:#ef4444;}' +
        '.c-sm{background:#f97316;}' +
        '.c-wo{background:#94a3b8;}' +
        '.c-h{background:#eab308;}' +
        '.c-l{background:#a855f7;}' +
        '.c-na{background:#fff; color:#cbd5e1; border:1px solid #e2e8f0;}' +
        '.welcome-msg{padding:80px; text-align:center; color:#94a3b8; font-size:14px;}' +
        '</style>';
    }

    function buildHeader(subId, startStr, endStr) {
        var su = url.resolveScript({ scriptId: runtime.getCurrentScript().id, deploymentId: runtime.getCurrentScript().deploymentId });
        return '<div class="pg-header"><div class="pg-logo">■ Development HRMS <small style="opacity:0.7; font-weight:normal; margin-left:10px;">| Attendance Summary Report</small></div>' +
            '<div><form method="GET" action="' + su + '">' +
            '<input type="hidden" name="script" value="' + runtime.getCurrentScript().id + '"><input type="hidden" name="deploy" value="' + runtime.getCurrentScript().deploymentId + '">' +
            '<select name="custpage_subsidiary" onchange="this.form.submit()"><option value="">Select Subsidiary</option>' + getOpts('subsidiary', subId) + '</select>' +
            '<span style="font-size:11px; margin-left:15px; color:#cbd5e1;">Start Date:</span>' +
            '<input type="date" name="custpage_startdate" value="' + startStr + '" onchange="this.form.submit()">' +
            '<span style="font-size:11px; margin-left:15px; color:#cbd5e1;">End Date:</span>' +
            '<input type="date" name="custpage_enddate" value="' + endStr + '" onchange="this.form.submit()">' +
            '</form></div></div>';
    }

    function getOpts(type, sel) {
        var sql = "SELECT id, name FROM " + type;
        if (type === 'subsidiary') {
            sql += " WHERE isinactive = 'F' ORDER BY name";
        }
        return query.runSuiteQL({ query: sql }).asMappedResults().map(function (r) {
            return '<option value="' + r.id + '"' + (sel == r.id ? ' selected' : '') + '>' + r.name + '</option>';
        }).join('');
    }

    function makeKpiCard(lbl, val, ico) {
        return '<div class="kpi-card">' + ico + '<div><div class="kpi-num">' + val + '</div><div class="kpi-lbl">' + lbl + '</div></div></div>';
    }

    return { onRequest: onRequest };

});
