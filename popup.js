function scrapeFormFields() {
    const fields = [];
    document.querySelectorAll('input, textarea, select').forEach(el => {
        if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button' || el.type === 'reset' || el.disabled) {
            return;
        }
        const fieldData = {
            id: el.id,
            name: el.name,
            tagName: el.tagName.toLowerCase(),
            type: el.type.toLowerCase(),
            label: el.labels?.[0]?.innerText || el.closest('label')?.innerText || '',
            ariaLabel: el.getAttribute('aria-label') || '',
            placeholder: el.placeholder
        };
        if (fieldData.tagName === 'select') {
            fieldData.options = Array.from(el.options).map(opt => opt.text).filter(Boolean);
        }
        fields.push(fieldData);
    });
    return fields;
}

function fillFormFields(actions) {
    let fieldsFilled = 0;
    actions.forEach(action => {
        const { identifier, action: actionType, value } = action;
        const element = document.getElementById(identifier) || document.querySelector(`[name="${identifier}"]`);

        if (!element) return;

        try {
            switch (actionType) {
                case 'fill':
                    element.value = value;
                    break;
                case 'check':
                    if (value === true) element.checked = true;
                    break;
                case 'select':
                    const lowerCaseValue = String(value).toLowerCase().trim();
                    const optionToSelect = Array.from(element.options).find(
                        opt => opt.text.toLowerCase().trim() === lowerCaseValue
                    );
                    if (optionToSelect) {
                        element.value = optionToSelect.value;
                    } else {
                        return;
                    }
                    break;
            }
            ['input', 'change', 'click'].forEach(eventName => 
                element.dispatchEvent(new Event(eventName, { bubbles: true }))
            );
            fieldsFilled++;
        } catch (e) {
            console.error(`Could not fill field ${identifier}:`, e);
        }
    });
    return `Filled ${fieldsFilled} out of ${actions.length} identified fields.`;
}