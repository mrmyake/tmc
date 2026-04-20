import { Placeholder } from "../_components/Placeholder";

export const metadata = {
  title: "Boekingen | The Movement Club",
  robots: { index: false, follow: false },
};

export default function BoekingenPage() {
  return (
    <Placeholder
      label="Boekingen"
      heading="Jouw boekingen"
      body="Overzicht van je komende lessen en historie verschijnt hier zodra het boekingssysteem live staat."
    />
  );
}
