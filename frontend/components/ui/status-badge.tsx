import { type CampaignStatus, statusTone } from "@/lib/campaign-status";
import ui from "./ui.module.css";

export function StatusBadge({ status, size }: { status: CampaignStatus; size?: "sm" }) {
  return <span className={ui.badge} data-tone={statusTone(status)} data-state={status} data-size={size}><i />{status}</span>;
}
