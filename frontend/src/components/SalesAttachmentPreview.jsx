import "../sales-attachment-preview.css";
import { Store } from "lucide-react";
import { FlipkartIcon, AmazonIcon, AjioIcon, MeeshoIcon, MyntraIcon } from "./MarketplaceIcons.jsx";

const PLATFORM_ICONS = {
  flipkart: FlipkartIcon,
  amazon: AmazonIcon,
  ajio: AjioIcon,
  meesho: MeeshoIcon,
  myntra: MyntraIcon,
  "flipkart warehouse": FlipkartIcon,
};

const count = value => Number(value || 0).toLocaleString("en-IN");
const amount = value => `₹${count(value)}`;

export default function SalesAttachmentPreview({ rows, totals }) {
  return (
    <div className="attachment-overview">
      <div className="attachment-summary-card">
      <table className="attachment-platform-summary" aria-label="Attachment platform summary">
        <thead><tr><th scope="col">Platform</th><th scope="col">Orders</th><th scope="col">Pieces</th><th scope="col">Amount</th></tr></thead>
        <tbody>
        {rows.map(row => {
          const PlatformIcon = PLATFORM_ICONS[row.platform.trim().toLowerCase()] || Store;
          return (
          <tr key={row.platform}>
            <th scope="row">
              <span className="attachment-platform-name">
                <span className="attachment-platform-mark" aria-hidden="true"><PlatformIcon className="attachment-platform-icon" /></span>
                <span>{row.platform}</span>
              </span>
            </th>
            <td>{count(row.total_orders)}</td>
            <td>{count(row.total_piece_qty)}</td>
            <td className="attachment-platform-amount">{amount(row.total_invoice_amount)}</td>
          </tr>
          );
        })}
        </tbody>
        <tfoot><tr><th scope="row">Total</th><td>{count(totals.orders)}</td><td>{count(totals.pieces)}</td><td>{amount(totals.amount)}</td></tr></tfoot>
      </table>
      </div>
    </div>
  );
}
