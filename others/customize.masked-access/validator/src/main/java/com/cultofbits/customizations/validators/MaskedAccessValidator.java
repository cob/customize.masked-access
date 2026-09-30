package com.cultofbits.customizations.validators;

import com.cultofbits.recordm.core.model.Instance;
import com.cultofbits.recordm.core.model.InstanceField;
import com.cultofbits.recordm.customvalidators.api.AbstractOnCreateValidator;
import com.cultofbits.recordm.customvalidators.api.OnUpdateValidator;
import com.cultofbits.recordm.customvalidators.api.ValidationError;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.List;

import static com.cultofbits.recordm.customvalidators.api.LocalizedValidationError.localized;
import static com.cultofbits.recordm.customvalidators.api.ValidationError.custom;

public class MaskedAccessValidator extends AbstractOnCreateValidator implements OnUpdateValidator {

    public static final String MASKED_ACCESS_KEYWORD = "$maskedAccess";
    public static final String MASKED_INFO_KEYWORD = "$maskedInfo";

    @Override
    public Collection<ValidationError> onCreate(Instance instance) {
        return validateInstanceFields(instance.getRootFields());
    }

    @Override
    public Collection<ValidationError> onUpdate(Instance persistedInstance, Instance updatedInstance) {
        return validateInstanceFields(updatedInstance.getRootFields());
    }

    public Collection<ValidationError> validateInstanceFields(List<InstanceField> instanceFields) {
        List<ValidationError> errors = new ArrayList<>();

        for (InstanceField field : instanceFields) {
            if (!field.isVisible()) {
                continue;
            }

            if (field.getValue() == null) {
                if (field.fieldDefinition.containsExtension(MASKED_ACCESS_KEYWORD)
                        || field.fieldDefinition.containsExtension(MASKED_INFO_KEYWORD)) {
                    return Collections.singletonList(localized(field, "masked-access", "masked-access.readonly-field"));
                }
            }

            if (!field.children.isEmpty()) {
                errors.addAll(validateInstanceFields(field.children));
            }
        }

        return errors;
    }
}
