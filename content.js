(async function() {
  const fields = [];
  document.querySelectorAll("input, textarea, select").forEach(el => {
    fields.push({
      id: el.id,
      name: el.name,
      placeholder: el.placeholder,
      label: el.labels?.[0]?.innerText || "",
      type: el.type
    });
  });

  chrome.runtime.sendMessage({ type: "fillForm", fields });
})();
