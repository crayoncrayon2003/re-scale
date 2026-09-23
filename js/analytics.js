const sendAnalyticsEvent = (eventName, parameters = {}) => {
  if (typeof window.gtag !== 'function') return;
  window.gtag('event', eventName, parameters);
};

document.querySelectorAll('[data-display-mode]').forEach(button => {
  button.addEventListener('click', () => sendAnalyticsEvent('display_mode_select', {
    display_mode: button.dataset.displayMode,
  }));
});

document.querySelector('#service-type')?.addEventListener('change', event => {
  sendAnalyticsEvent('service_type_select', { service_type: event.target.value });
});

document.querySelector('#service-day')?.addEventListener('change', event => {
  sendAnalyticsEvent('service_day_select', { service_day: event.target.value });
});

document.querySelectorAll('.hazard-toggle').forEach(input => {
  input.addEventListener('change', () => sendAnalyticsEvent('hazard_toggle', {
    hazard_type: input.dataset.hazard,
    enabled: input.checked,
  }));
});

[
  ['#distance-range', 'effective_time_limit'],
  ['#hazard-cap', 'hazard_cap'],
  ['#transfer-extra', 'transfer_extra'],
].forEach(([selector, settingName]) => {
  document.querySelector(selector)?.addEventListener('change', event => {
    sendAnalyticsEvent('setting_change', {
      setting_name: settingName,
      setting_value: Number(event.target.value),
    });
  });
});

document.querySelectorAll('.hazard-weight').forEach(input => {
  input.addEventListener('change', () => sendAnalyticsEvent('setting_change', {
    setting_name: `hazard_weight_${input.dataset.hazardWeight}`,
    setting_value: Number(input.value),
  }));
});

document.querySelectorAll('.advanced-settings, #mds-quality').forEach(details => {
  details.addEventListener('toggle', () => {
    if (!details.open) return;
    sendAnalyticsEvent('details_open', {
      details_name: details.id || 'advanced_settings',
    });
  });
});
