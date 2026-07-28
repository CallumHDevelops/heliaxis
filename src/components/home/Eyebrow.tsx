import { SparkIcon } from './Spark';

interface EyebrowProps {
  children: React.ReactNode;
  onDark?: boolean;
}

export function Eyebrow({ children, onDark }: EyebrowProps) {
  return (
    <span className={`eyebrow${onDark ? ' on-dark' : ''}`}>
      <SparkIcon className="spark-ico" />
      {children}
    </span>
  );
}
