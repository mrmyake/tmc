"use client";

import { useEffect, useState } from "react";
import { GoogleAnalytics } from "@next/third-parties/google";
import { getConsent } from "@/lib/consent";

const GA_ID = "G-2VFCDM4KRZ";

export function Analytics() {
  const [consentGranted, setConsentGranted] = useState(false);

  useEffect(() => {
    // Set Consent Mode v2 defaults
    if (window.gtag) {
      window.gtag("consent", "default", {
        analytics_storage: "denied",
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
        wait_for_update: 500,
      });
    }

    setConsentGranted(getConsent() === "granted");
  }, []);

  if (!consentGranted) return null;

  return <GoogleAnalytics gaId={GA_ID} />;
}
