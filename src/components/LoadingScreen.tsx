interface LoadingScreenProps {
  message: string;
  submessage?: string;
}

export default function LoadingScreen({ message, submessage }: LoadingScreenProps) {
  return (
    <div className="loading-screen">
      <div className="loading-content">
        <div className="loading-spinner" />
        <h2>{message}</h2>
        {submessage && <p className="loading-sub">{submessage}</p>}
      </div>
    </div>
  );
}
