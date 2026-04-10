"use client";

import { ReactGoogleReviews } from "react-google-reviews";
import "react-google-reviews/dist/index.css";

const FEATURABLE_WIDGET_ID = "ef34740b-2ef8-467f-abbf-e58e3d348bdf";

export function GoogleReviewsBadge() {
  return (
    <div className="mt-8">
      <ReactGoogleReviews
        layout="badge"
        featurableId={FEATURABLE_WIDGET_ID}
        theme="dark"
      />
    </div>
  );
}
