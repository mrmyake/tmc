interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}

export function Card({ children, className = "", hover = true }: CardProps) {
  return (
    <div
      className={`bg-bg-elevated border border-bg-subtle p-6 md:p-8 transition-all duration-300 ${
        hover ? "hover:scale-[1.02] hover:shadow-lg hover:shadow-accent/5" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}
