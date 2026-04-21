interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}

export function Card({ children, className = "", hover = true }: CardProps) {
  const hoverClasses = hover ? "hover:border-accent/40" : "";
  return (
    <div
      className={`bg-bg-elevated border border-transparent p-8 transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] ${hoverClasses} ${className}`}
    >
      {children}
    </div>
  );
}
