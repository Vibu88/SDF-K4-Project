/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope Public
 */
define(['N/https', 'N/url', 'N/query', 'N/log', 'N/currentRecord', 'N/runtime', 'N/record', 'N/search'],
    (https, url, query, log, currentRecord, runtime, record, search) => {

        /**
         * pageInit – runs when the page loads
         */
        const pageInit = (context) => {
            try {
                const currentRec = context.currentRecord;
                log.debug('Current Record Type', currentRec ? currentRec.type : 'null');
                log.debug('Current Record', JSON.stringify(currentRec));

                const currentUser = runtime.getCurrentUser();
                const userRoleId = currentUser.role;
                log.debug('User Role ID', userRoleId);

                if (!userRoleId) {
                    return;
                }

                // Search for subsidiaries accessible to the user's role
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

                    if (subsidiaryId && !accessibleSubsidiaries.some(s => s.id === subsidiaryId)) {
                        accessibleSubsidiaries.push({
                            id: subsidiaryId,
                            name: subsidiaryText
                        });
                    }
                }

                log.debug('Accessible Subsidiaries', accessibleSubsidiaries);

                const subsidiaryField = currentRec.getField({ fieldId: 'custscript_subsidiary' });
                log.debug('Subsidiary Field', subsidiaryField ? `Found: ${JSON.stringify(subsidiaryField)}` : 'Not Found');

                if (subsidiaryField && subsidiaryField.type === 'select') {
                    try {
                        // Clear existing options
                        const allOptions = subsidiaryField.getSelectOptions() || [];
                        log.debug('Current Select Options', allOptions);

                        for (let j = 0; j < allOptions.length; j++) {
                            subsidiaryField.removeSelectOption({ value: allOptions[j].value });
                        }

                        // Add default option
                        subsidiaryField.insertSelectOption({
                            value: '',
                            text: '--Select Subsidiary--'
                        });

                        // Add accessible subsidiaries
                        for (let k = 0; k < accessibleSubsidiaries.length; k++) {
                            subsidiaryField.insertSelectOption({
                                value: accessibleSubsidiaries[k].id,
                                text: accessibleSubsidiaries[k].name
                            });
                        }

                        log.debug('Subsidiary field updated successfully');
                    } catch (e) {
                        log.error('Error updating select options', `${e.message} | Stack: ${e.stack}`);
                    }
                } else {
                    log.error('Field Issue', `custscript_subsidiary not found or not a select field. Type: ${subsidiaryField ? subsidiaryField.type : 'null'}`);
                }
            } catch (e) {
                log.error('Error in pageInit', `${e.message} | Stack: ${e.stack}`);
            }
        };

        /**
         * fieldChanged – triggers when a field value changes
         */
        const fieldChanged = (context) => {
            // debugger;   // Uncomment only when debugging in browser
            try {
                const currentRec = context.currentRecord;
                const fieldId = context.fieldId;

                if (fieldId === 'custscript_subsidiary') {
                    const selectedSubsidiary = currentRec.getValue({ fieldId: 'custscript_subsidiary' });
                    log.debug({
                        title: 'Selected Subsidiary',
                        details: selectedSubsidiary
                    });

                    const paygroupField = currentRec.getField({ fieldId: 'custscript_paygroup' });
                    log.debug({
                        title: 'Paygroup Field',
                        details: paygroupField ? `Found: ${JSON.stringify(paygroupField)}` : 'Not Found'
                    });

                    if (!paygroupField) {
                        return;
                    }

                    // Clear existing paygroup options
                    const allOptions = paygroupField.getSelectOptions() || [];
                    log.debug('Current Select Options', allOptions);

                    for (let j = 0; j < allOptions.length; j++) {
                        paygroupField.removeSelectOption({ value: allOptions[j].value });
                    }

                    // If a subsidiary is selected, load related pay groups
                    if (selectedSubsidiary) {
                        const paygroupQuery = `SELECT DISTINCT id, name 
                                               FROM customrecord_hris_process_groupmaster 
                                               WHERE isinactive = 'F' 
                                                 AND custrecord_hris__subsidiary = '${selectedSubsidiary}'`;

                        const queryResults = query.runSuiteQL({
                            query: paygroupQuery
                        });

                        const records = queryResults.asMappedResults();
                        log.debug({
                            title: 'Paygroup Query Results',
                            details: records
                        });

                        if (records.length > 0) {
                            for (let r = 0; r < records.length; r++) {
                                const rec = records[r];
                                paygroupField.insertSelectOption({
                                    value: rec.id,
                                    text: rec.name
                                });
                            }

                            log.debug({
                                title: 'Paygroup Field Update',
                                details: `Paygroup field updated successfully with ${records.length} options`
                            });
                        } else {
                            log.debug({
                                title: 'No Paygroups Found',
                                details: `No paygroups found for subsidiary: ${selectedSubsidiary}`
                            });
                        }
                    }
                }
            } catch (e) {
                log.error({
                    title: 'Error in fieldChanged',
                    details: `${e.message} | Stack: ${e.stack}`
                });
            }
        };

        return {
            pageInit,
            fieldChanged
        };
    });