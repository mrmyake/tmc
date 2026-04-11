export const metadata = {
  title: "The Movement Club — Studio",
  robots: { index: false },
};

export default function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="sanity-studio" style={{ height: "100vh" }}>{children}</div>;
}
