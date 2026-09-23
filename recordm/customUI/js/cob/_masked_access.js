cob.custom.customize.push(function (core, utils, ui) {

    const KEYWORD_MASKED_ACCESS = "$maskedAccess";
    const KEYWORD_MASKED_INFO = "$maskedInfo";
    const HIDDEN_VALUE = "************";

    core.customizeAllInstances((instance, presenter) => {

        presenter.findFieldPs(childFp => childFp.getField().fieldDefinition.configuration.extensions[KEYWORD_MASKED_ACCESS])
            .forEach(maskedGroupFP => {
                let maskedGroupHtml = maskedGroupFP.content()[0];

                if (instance.isNew() || presenter.isGroupEdit()) {
                    maskedGroupHtml.querySelector(".cob-fields-list").innerHTML = `<p style="margin: 10px">${core.translateString("masked-access", "masked-access.not-available", "localresource/i18n")}</p>`;
                    return;
                }

                const confs = maskedGroupFP.getField().fieldDefinition.configuration.extensions[KEYWORD_MASKED_ACCESS];

                if (!confs.args || confs.args.length <= 1) {
                    maskedGroupHtml.innerHTML = `<p class='text-error'>${core.translateString("masked-access", "masked-access.invalid-configuration", "localresource/i18n")}</p>`;
                    return;
                }

                maskedGroupHtml.querySelector(".group-name")
                    .insertAdjacentHTML(
                        "beforebegin",
                        "<span class=\"toggle-button label js-masked-get-value\" style=\"margin-right: 6px;\" data-state=\"hidden\">" +
                        "         <i class=\"js-masked-icon icon-eye-close\"></i> " +
                        "       </span>",
                    );

                const instanceId = instance.data.id;
                const fields = {};

                // Replace all fields with new fields that will not be attached to the instance.
                // With this change we can set values into these fields that they will not sent when updating the instance
                presenter.findFieldPsUnder(maskedGroupFP, fp => fp.getField().fieldDefinition.configuration.extensions[KEYWORD_MASKED_INFO])
                    .forEach(sFp => {
                        // disable the field. This field will never hold any information.
                        sFp.disable();

                        const fieldPHtml = sFp.content()[0];
                        const inputWrapper = fieldPHtml.querySelector("input").parentNode;

                        const sFConf = sFp.getField().fieldDefinition.configuration.extensions[KEYWORD_MASKED_INFO];
                        if (!sFConf.args || sFConf.args.length !== 1) {
                            fieldPHtml.querySelector("input").parentNode.innerHTML = `<p class='text-error'>${core.translateString("masked-access", "masked-access.invalid-configuration", "localresource/i18n")}</h4>`;
                            return;
                        }

                        const maskedField = sFConf.args[0];

                        // replace the input with another so we can change the value without
                        // affecting the instance field
                        inputWrapper.innerHTML = `<input type="text"
                          class="js-masked-info box-border field-value cob-field-value w-60 disabled"
                          style="width: 200px;"
                          readonly=""
                          data-fielddefid="${sFp.getField().fieldDefinition.id}"
                          value="${HIDDEN_VALUE}">`;

                        fields[maskedField] = inputWrapper.childNodes[0]
                    });

                // Prepare the update link. It will only be visible if the user has authorization to edit. Check response for targetInstanceId.
                maskedGroupHtml.querySelector(".group-name")
                    .insertAdjacentHTML(
                        "afterend",
                        "<div class=\"js-masked-values-edit-link inline cursor-pointer text-sm hidden\" style=\"margin-left: 20px; vertical-align:middle; color: #39c;\">" +
                        `   (${core.translateString("masked-access", "masked-access.update-click-text", "localresource/i18n")}) ` +
                        " </div>",
                    );

                maskedGroupHtml.querySelector(".js-masked-values-edit-link").addEventListener("click", async (ev) => {
                    const link = document.createElement('a');
                    link.href = window.location.href
                    link.hash = `#/instance/${ev.currentTarget.dataset.targetInstanceId}`;
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                    link.click();
                })

                // Prepare the create link. It will only be visible if the user has authorization to create. Check response for targetDefinitionId
                maskedGroupHtml.querySelector(".cob-fields-list")
                    .insertAdjacentHTML(
                        "afterbegin",
                        `<li class="js-masked-values-create-link cursor-pointer text-sm hidden" style="margin-left: 72px; vertical-align:middle; color: #39c;">` +
                        `   ${core.translateString("masked-access", "masked-access.create-click-text", "localresource/i18n")} ` +
                        " </li>",
                    );

                maskedGroupHtml.querySelector(".js-masked-values-create-link").addEventListener("click", async (ev) => {
                    const link = document.createElement('a');
                    link.href = window.location.href
                    link.hash = "#/instance/create/" + ev.currentTarget.dataset.targetDefinitionId + "/data=" + JSON.stringify({
                        opts: { 'auto-paste-if-empty': true},
                        fields: [
                            {fieldDefinition: {name: confs.args[1]}, value: instance.data.id}
                        ]
                    });
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                    link.click();
                })

                // Handle mask and unmaks of the fields
                maskedGroupHtml.querySelector(".js-masked-get-value")
                    .addEventListener("click", async (ev) => {
                        const revealButton = ev.currentTarget;

                        if (revealButton.dataset.state === "hidden") {
                            try {
                                const result = await getMaskedValues(
                                    instanceId,
                                    maskedGroupFP.getField().fieldDefinition.id,
                                    Object.values(fields).map(el => el.dataset["fielddefid"]));

                                // There was a related instance
                                if (result.values) {
                                    maskedGroupHtml.querySelectorAll("li:not(.js-masked-values-create-link)")
                                        .forEach(el => el.classList.remove("hidden"))

                                    for (const [key, input] of Object.entries(fields)) {
                                        input.value = result.values[key] ? result.values[key] : "";
                                    }

                                    if (result._targetInstanceId) {
                                        const updateLinkEl = maskedGroupHtml.querySelector(".js-masked-values-edit-link")
                                        updateLinkEl.classList.remove("hidden")
                                        updateLinkEl.dataset.targetInstanceId = result._targetInstanceId
                                    }

                                    // No related instance found but user can create
                                } else if (result._targetDefinitionId) {
                                    maskedGroupHtml.querySelectorAll("li:not(.js-masked-values-create-link)")
                                        .forEach(el => el.classList.add("hidden"))

                                    const updateLinkEl = maskedGroupHtml.querySelector(".js-masked-values-create-link")
                                    updateLinkEl.classList.remove("hidden")
                                    updateLinkEl.dataset.targetDefinitionId = result._targetDefinitionId
                                }

                                const icon = revealButton.querySelector(".js-masked-icon");
                                icon.classList.replace("icon-eye-close", "icon-eye-open")
                                revealButton.dataset.state = "visible"

                            } catch (e) {
                                console.error(e)
                                ui.notification.showError("Erro getting values", true);
                            }

                        } else {
                            revealButton.dataset.state = "hidden";
                            maskedGroupHtml.querySelectorAll("li:not(.js-masked-values-create-link)")
                                .forEach(el => el.classList.remove("hidden"))

                            maskedGroupHtml.querySelector(".js-masked-values-edit-link").classList.add("hidden")
                            maskedGroupHtml.querySelector(".js-masked-values-create-link").classList.add("hidden")

                            Object.values(fields)
                                .forEach(input => input.value = HIDDEN_VALUE);

                            const icon = revealButton.querySelector(".js-masked-icon");
                            icon.classList.replace("icon-eye-open", "icon-eye-close")
                        }

                    });
            });
    });

    async function getMaskedValues(instanceId, maskedAccessFieldDefId, maskedInfoFieldDefIds) {
        core.showLoading("masked-get-values");

        try {
            const result = await fetch("/integrationm/concurrent/_masked-access-get-values", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    instanceId,
                    maskedAccessFieldDefId,
                    maskedInfoFieldDefIds,
                }),
            }).then((res) => {
                if (!res.ok) throw new Error(`Request failed: ${res.status}`);
                return res.json();
            });

            return result;

        } finally {
            core.hideLoading("masked-get-values");
        }
    }

});
