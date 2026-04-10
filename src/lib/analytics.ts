declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

type EventParams = {
  event_category?: string;
  event_label?: string;
  value?: number;
  [key: string]: string | number | undefined;
};

export const trackEvent = (eventName: string, params?: EventParams) => {
  if (typeof window !== "undefined" && window.gtag) {
    window.gtag("event", eventName, params);
  }
};

export const trackLead = (type: string, value: number = 1) => {
  trackEvent("generate_lead", {
    event_category: "lead_magnet",
    event_label: type,
    value,
  });
};

export const trackCTA = (buttonText: string, page: string) => {
  trackEvent("cta_click", {
    event_category: "engagement",
    event_label: buttonText,
    page_location: page,
  });
};

export const trackContact = (method: "phone" | "whatsapp" | "email") => {
  trackEvent(`click_${method}`, {
    event_category: "contact",
    event_label: `${method}_click`,
  });
};

export const trackFormStart = (formName: string) => {
  trackEvent("form_start", {
    event_category: "engagement",
    event_label: formName,
  });
};
