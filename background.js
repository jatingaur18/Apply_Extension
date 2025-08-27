const API_KEY = "Api Key here";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

chrome.action.onClicked.addListener((tab) => {
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['popup.js']
  }, () => {
    if (chrome.runtime.lastError) {
      console.error('Error injecting popup.js:', chrome.runtime.lastError);
      return;
    }
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['injector.js']
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error injecting injector.js:', chrome.runtime.lastError);
      }
    });
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message.type);
  
  if (message.type === "get-active-tab") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      sendResponse(tabs[0]);
    });
    return true; 
  }

  if (message.type === "execute-script") {
    let funcToExecute;
    switch (message.func) {
      case "scrapeFormFields":
        funcToExecute = scrapeFormFields;
        break;
      case "fillFormFields":
        funcToExecute = fillFormFields;
        break;
      default:
        
        console.error("Unknown function to execute:", message.func);
        sendResponse({ error: `Unknown function: ${message.func}` });
        return;
    }

    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      func: funcToExecute,
      args: message.args || [],
    }, (results) => {
      if (chrome.runtime.lastError) {
        console.error('Script execution error:', chrome.runtime.lastError.message);
        sendResponse({ error: chrome.runtime.lastError.message });
      } else if (results && results[0]) {
        sendResponse(results[0].result);
      } else {
        sendResponse({ error: 'No results returned from script' });
      }
    });
    return true;
  }

  if (message.type === 'get-form-mapping') {
    const { profileData, formFields } = message;

    if (!profileData || !formFields) {
      sendResponse({ error: "Missing profileData or formFields" });
      return;
    }

    const prompt = `
You are an exceptionally intelligent job application assistant. Your task is to create a precise plan to fill out a web form using the provided user profile.

**User Profile Data (JSON):**
${JSON.stringify(profileData, null, 2)}

**Web Form Fields (JSON):**
This array contains objects, each representing a field from the webpage. Note the 'tagName', 'type', 'ariaLabel', and 'options' properties.
${JSON.stringify(formFields, null, 2)}

**Your Task:**
Create a JSON array of "action" objects. Each object must have three keys:

1. "identifier": The "id" or "name" of the form field. Use "id" if available, otherwise "name".
2. "action": The type of action to perform. Must be one of: "fill", "check", "select".
3. "value": The data to use for the action.

**Instructions for each action type:**
-  **"action": "fill"**: For text inputs ('text', 'email', 'tel') and textareas. The "value" should be the string from the user's profile.
-  **"action": "check"**: For checkboxes or radio buttons. The "value" must be a boolean (true/false).
-  **"action": "select"**: For dropdowns ('select-one'). 
  -  **CRITICAL:** The "value" MUST be an EXACT, case-sensitive copy of one of the strings from the 'options' array provided for that field. 
  -  Analyze the user's profile to choose the best option.
  -  If no option is a clear and direct match, DO NOT invent a value or guess. Omit the entire action object for that field from your response.

Analyze each field carefully, using its label, ariaLabel, placeholder, and type to understand what profile data is required.
Also fill the data related to "Why do you want to join this company" or similar questions using short human-like company centric responses.
Fill the data such that I need not to change anything in the form before submitting.

**Output ONLY the JSON array of action objects. Do not include any explanations, markdown, or other text.**
`;

    fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    })
    .then(res => {
      if (!res.ok) {
        throw new Error(`API request failed with status ${res.status}`);
      }
      return res.json();
    })
    .then(data => {
      console.log('Gemini API response:', data);
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!rawText) {
        throw new Error('No text response from Gemini API');
      }
      
      const cleanedText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
      
      try {
        const parsedActions = JSON.parse(cleanedText);
        console.log('Parsed actions:', parsedActions);
        sendResponse(parsedActions);
      } catch (e) {
        console.error("Failed to parse Gemini response:", cleanedText, e);
        sendResponse({ error: "Failed to parse response from AI." });
      }
    })
    .catch(err => {
      console.error("Gemini API error:", err);
      sendResponse({ error: `API Error: ${err.message}` });
    });

    return true; 
  }
   
  
  if (message.type === 'ask-gemini-with-context') {
    const { query, profileData, scrapedData, chatContext } = message;
    
    if (!query || !profileData) {
      sendResponse({ answer: "Missing query or profile data." });
      return;
    }
    
    let prompt = `You are a helpful AI assistant for a user named Jatin. You maintain context across our conversation and provide thoughtful, personalized responses.

User Profile:
${JSON.stringify(profileData, null, 2)}`;

    
    if (scrapedData && scrapedData.formFields) {
      prompt += `

Current Webpage Information:
- Page Title: ${scrapedData.title}
- Page URL: ${scrapedData.url}
- Form Fields Found (${scrapedData.formFields.length} fields):
${JSON.stringify(scrapedData.formFields, null, 2)}`;
    }

    
    if (chatContext && chatContext.length > 0) {
      prompt += `

Previous Conversation Context:`;
      
      
      const recentContext = chatContext.slice(-10); 
      recentContext.forEach((msg, index) => {
        const role = msg.role === 'user' ? 'User' : 'Assistant';
        prompt += `
${role}: ${msg.content}`;
      });
      
      prompt += `

Current User Question: "${query}"

Please respond naturally, considering our previous conversation and maintaining context. Reference previous topics when relevant.`;
    } else {
      prompt += `

User's Question: "${query}"

Please provide a helpful, conversational response based on the available data.`;
    }
    
    fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    })
    .then(res => res.json())
    .then(data => {
      const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response found.";
      sendResponse({ answer });
    })
    .catch(err => {
      console.error("Gemini API error:", err);
      sendResponse({ answer: "Sorry, an error occurred." });
    });

    return true; 
  }

  if (message.type === 'ask-gemini') {
    const { query, profileData, scrapedData } = message;
    
    if (!query || !profileData) {
      sendResponse({ answer: "Missing query or profile data." });
      return;
    }
    
    let prompt = `
      You are a helpful AI assistant for a user named Jatin.
      Your knowledge includes the professional profile data and optionally scraped form data from the current webpage.
      Answer the user's questions conversationally based on this data.
       
      User Profile:
      ${JSON.stringify(profileData, null, 2)}`;

    if (scrapedData && scrapedData.formFields) {
      prompt += `

      Current Webpage Information:
      - Page Title: ${scrapedData.title}
      - Page URL: ${scrapedData.url}
      - Form Fields Found (${scrapedData.formFields.length} fields):
      ${JSON.stringify(scrapedData.formFields, null, 2)}
      
      You can analyze these form fields, suggest improvements to the profile data, 
      help understand what information might be needed, or answer questions about 
      how well the profile matches the form requirements.`;
    }

    prompt += `

      User's Question: "${query}"
      
      Please provide a helpful, conversational response based on the available data.`;
    
     
    fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    })
    .then(res => res.json())
    .then(data => {
      const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response found.";
      sendResponse({ answer });
    })
    .catch(err => {
      console.error("Gemini API error:", err);
      sendResponse({ answer: "Sorry, an error occurred." });
    });

    return true; 
  }
});

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
      type: el.type ? el.type.toLowerCase() : 'text',
      label: el.labels?.[0]?.innerText || el.closest('label')?.innerText || '',
      ariaLabel: el.getAttribute('aria-label') || '',
      placeholder: el.placeholder || ''
    };
    
    if (fieldData.tagName === 'select') {
      fieldData.options = Array.from(el.options).map(opt => opt.text).filter(Boolean);
    }
    
    if (fieldData.id || fieldData.name) {
      fields.push(fieldData);
    }
  });
  
  console.log('Scraped fields:', fields);
  return fields;
}

function fillFormFields(actions) {
  if (!Array.isArray(actions)) {
    return "Error: Actions must be an array";
  }
  
  let fieldsFilled = 0;
  let errors = [];
  
  actions.forEach((action, index) => {
    const { identifier, action: actionType, value } = action;
    
    if (!identifier || !actionType) {
      errors.push(`Action ${index}: Missing identifier or action type`);
      return;
    }
    
    const element = document.getElementById(identifier) || document.querySelector(`[name="${identifier}"]`);

    if (!element) {
      errors.push(`Field not found: ${identifier}`);
      return;
    }

    try {
      switch (actionType) {
        case 'fill':
          if (element.tagName.toLowerCase() === 'input' || element.tagName.toLowerCase() === 'textarea') {
            element.value = String(value || '');
            fieldsFilled++;
          }
          break;
        case 'check':
          if (element.type === 'checkbox' || element.type === 'radio') {
            element.checked = Boolean(value);
            fieldsFilled++;
          }
          break;
        case 'select':
          if (element.tagName.toLowerCase() === 'select') {
            const lowerCaseValue = String(value).toLowerCase().trim();
            const optionToSelect = Array.from(element.options).find(
              opt => opt.text.toLowerCase().trim() === lowerCaseValue
            );
            if (optionToSelect) {
              element.value = optionToSelect.value;
              fieldsFilled++;
            } else {
              errors.push(`Option not found for ${identifier}: ${value}`);
            }
          }
          break;
        default:
          errors.push(`Unknown action type: ${actionType}`);
      }
      
      ['input', 'change', 'blur'].forEach(eventName => {
        try {
          element.dispatchEvent(new Event(eventName, { bubbles: true }));
        } catch (e) {

        }
      });
      
    } catch (e) {
      errors.push(`Error filling field ${identifier}: ${e.message}`);
    }
  });
  
  let result = `Filled ${fieldsFilled} out of ${actions.length} fields.`;
  if (errors.length > 0) {
    result += ` Errors: ${errors.join('; ')}`;
  }
  
  return result;
}