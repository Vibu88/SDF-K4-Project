/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope Public
 */
define(['N/record', 'N/log', 'N/search'], function (record, log, search) {

    function afterSubmit(scriptContext) {
        try {
            log.debug('Execution Context Type', scriptContext.type);
            
            // Only execute when a brand new document record transaction is initialized
            if (scriptContext.type !== 'create') {
                return;
            }

            const newRecordRef = scriptContext.newRecord;
            const recordType = newRecordRef.type.toLowerCase();
            let s_auto_prefix = '';

            // 1. Assign Record Prefix Matches
            if (recordType === 'customrecord_hris_passport_requestform') {
                s_auto_prefix = 'PR';
            } else if (recordType === 'customrecord_hris_resign_form') {
                s_auto_prefix = 'REG REQ';
            } else if (recordType === 'customrecord_noc') {
                s_auto_prefix = 'NOC';
            } else if (recordType === 'customrecord_hris_visalrenewalcancelform') {
                s_auto_prefix = 'VRC';
            } else if (recordType === 'customrecord_hris_emp_transfer') {
                s_auto_prefix = 'EMP-TRNS';
            } else if (recordType === 'customrecord_hr_interview_evaluation_for') {
                s_auto_prefix = 'IR';
            }else if(recordType=='customrecord_hris_lve_letter_req'){
                s_auto_prefix='LR'
            }
            else if(recordType=='customrecord_change_in_status'){
                s_auto_prefix='CS'
            }
            else if(recordType=='customrecord_discipline_notice'){
                s_auto_prefix='DN'
            }
             else if(recordType=='customrecord_hr_exit_interview_form'){
                s_auto_prefix='EF'
            }
            else if(recordType=='customrecord_disciplinary_memo'){
                s_auto_prefix='EM'
            }else if(recordType=='customrecord_rejoin_request'){
                s_auto_prefix='RR'
            }
            else if(recordType=='customrecord_hris_expense_claim_form'){
                s_auto_prefix='EC'
            }           
             else if(recordType=='customrecord_ess_travel_requisition_form'){
                s_auto_prefix='TR'
            }
            else if (recordType == 'customrecord_hris_asset_req_form') {
            s_auto_prefix = 'ARF';
        }
           else if (recordType == 'customrecord_hris_empchange_loan_applicn') {
            s_auto_prefix = 'LON';
        }

            log.debug('Assigned Prefix', s_auto_prefix);

            // Fetch structural schema unique target IDs
            const i_rec_type_id = newRecordRef.getValue({ fieldId: 'rectype' });
            log.debug('Internal Record Structure Type Key ID', i_rec_type_id);

            // 2. Locate Active Auto-Increment Sequence Tracking Map Records
            const uniqueRefSearch = search.create({
                type: "customrecord_hris_unique_reference_numbe",
                filters: [
                    ["custrecord_hris_record_type", "anyof", i_rec_type_id],
                    "AND",
                    ["isinactive", "is", "F"]
                ],
                columns: [
                    search.createColumn({ name: "custrecord_hris_unique_number" }),
                    search.createColumn({ name: "internalid" })
                ]
            });

            const searchResults = uniqueRefSearch.run().getRange({ start: 0, end: 1 });
            
            if (!searchResults || searchResults.length === 0) {
                log.debug('No unique reference configuration found for this record type.');
                return;
            }

            const targetConfigRow = searchResults[0];
            const i_id_unique_ref = targetConfigRow.getValue({ name: 'internalid' });
            let i_unique_num = parseInt(targetConfigRow.getValue({ name: 'custrecord_hris_unique_number' }), 10) || 0;

            // Increment sequence counters
            i_unique_num = i_unique_num + 1;
            log.debug('Next Sequence ID Calculated', i_unique_num);

            const i_fullYear = new Date().getFullYear();
            let i_employee = '';

            // 3. Extract the context employee reference ID
            if (recordType === 'customrecord_hris_passport_requestform') {
                i_employee = newRecordRef.getValue({ fieldId: 'custrecord_hris_pass_empname' });
            } else if (recordType === 'customrecord_hris_resign_form') {
                i_employee = newRecordRef.getValue({ fieldId: 'custrecord_hris_res_employee_code' });
            } else if (recordType === 'customrecord_noc') {
                i_employee = newRecordRef.getValue({ fieldId: 'custrecord_employee' });
            } else if (recordType === 'customrecord_hris_visalrenewalcancelform') {
                i_employee = newRecordRef.getValue({ fieldId: 'custrecord_hris_visarencan_empname' });
            }else if(recordType=='customrecord_hris_lve_letter_req'){
                i_employee = newRecordRef.getValue({ fieldId: 'custrecord_hris_letreq_employee_name' });
            }else if(recordType=='customrecord_discipline_notice'){
                i_employee = newRecordRef.getValue({ fieldId: 'custrecord_hris_discipline_employee' });
            }else if(recordType=='customrecord_hr_exit_interview_form'){
                i_employee = newRecordRef.getValue({ fieldId: 'custrecord_hr_exit_employee_name' });
            }
            else if(recordType=='customrecord_disciplinary_memo'){
                i_employee = newRecordRef.getValue({ fieldId: 'custrecord_dm_employee' });
            }
             else if(recordType=='customrecord_rejoin_request'){
                i_employee = newRecordRef.getValue({ fieldId: 'custrecord_rejoin_request_employee' });
            }
            else if(recordType=='customrecord_hris_expense_claim_form'){
                i_employee = newRecordRef.getValue({ fieldId: 'custrecord_hris_exp_claim_frm_employee' });
            }
              else if(recordType=='customrecord_ess_travel_requisition_form'){
                  i_employee = newRecordRef.getValue({ fieldId: 'custrecord_ess_trf_employee_name' });
            }
            else if (recordType == 'customrecord_hris_asset_req_form') {
            i_employee = newRecordRef.getValue({ fieldId: 'custrecord_hris_asset_emp_name' });
        }
          else if(recordType=='customrecord_hris_empchange_loan_applicn'){
            i_employee= newRecordRef.getValue({ fieldId: 'custrecord_hris_loan_emp_name' });
          }
            let s_auto_number = '';

            if (i_employee) {
                // Optimized performance alternative to loading the entire employee profile row
                const empLookup = search.lookupFields({
                    type: search.Type.EMPLOYEE,
                    id: i_employee,
                    columns: ['firstname','custentity_hris_empfname']
                });

                let s_name = empLookup.firstname ? empLookup.firstname.toUpperCase() : '';
                if(s_name==''){
                    let s_name = empLookup.custentity_hris_empfname ? empLookup.custentity_hris_empfname.toUpperCase() : '';
                }
                if (s_name) {
                    let s_emp_char = s_name.substring(0, 1);
                    let lastFour = s_name.substring(s_name.length - 3);
                    s_auto_number = `${s_auto_prefix}-${s_emp_char}${lastFour}-${i_unique_num}-${i_fullYear}`;
                }
            } 
            
            // Fallback generation pattern if employee reference is absent or not required
            if (!s_auto_number) {
                if (recordType === 'customrecord_hris_emp_transfer' || recordType === 'customrecord_hr_interview_evaluation_for' || recordType=='customrecord_change_in_status') {
                    s_auto_number = `${s_auto_prefix}-${i_unique_num}-${i_fullYear}`;
                } else {
                    s_auto_number = `${s_auto_prefix}-${i_unique_num}-${i_fullYear}`;
                }
            }

            log.debug('Final Generated Reference String', s_auto_number);

            // 4. Update the newly created transaction instance record via submitFields
            record.submitFields({
                type: newRecordRef.type,
                id: newRecordRef.id,
                values: {
                    'name': s_auto_number
                },
                options: {
                    enforceTriggering: false,
                    ignoreMandatoryFields: true
                }
            });

            // 5. Commit updated counter sequence tracking states
            record.submitFields({
                type: 'customrecord_hris_unique_reference_numbe',
                id: i_id_unique_ref,
                values: {
                    'custrecord_hris_unique_number': i_unique_num
                }
            });

        } catch (e) {
            log.error('Error within afterSubmit unique mapping reference generator', e);
        }
    }

    return {
        afterSubmit: afterSubmit
    };
});