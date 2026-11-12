import { Mark } from "@/components/landing/Mark";

export default function Loading() {
  return (
    <div className="boot" role="status" aria-label="Loading">
      <Mark size={40} />
      <p className="mono-label">Opening the file</p>
    </div>
  );
}
