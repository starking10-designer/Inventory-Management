const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "2XL"];

const PRINT_STYLES = `
  @page { size: A4 landscape; margin: 8mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 8px; color: #111; margin: 0; padding: 8px; }
  h1 { font-size: 12px; margin: 0 0 8px; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td { border: 1px solid #333; padding: 2px 3px; text-align: center; word-wrap: break-word; }
  th { background: #1f4e78; color: #fff; font-size: 7px; }
  .left { text-align: left; }
  .meta { font-size: 8px; color: #444; margin-bottom: 6px; }
  .return { background: #fff3cd; }
`;

function openPrintDocument(title, bodyHtml) {
  const win = window.open("", "_blank");
  if (!win) {
    alert("Please allow pop-ups to print the report.");
    return;
  }
  win.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>${title}</title>
<style>${PRINT_STYLES}</style></head><body>${bodyHtml}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
  }, 350);
}

function formatQty(v) {
  if (v === undefined || v === null || v === 0) return "-";
  return v;
}

function pivotFinalReport(report) {
  const sizeSet = new Set();
  const grouped = new Map();

  for (const item of report) {
    const size = String(item.size || "").toUpperCase().trim();
    if (size) sizeSet.add(size);
    const key = `${item.style}\x00${item.color}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        style: item.style,
        color: item.color,
        sizes: {},
      });
    }
    grouped.get(key).sizes[size] = item;
  }

  const sizes = SIZE_ORDER.filter((s) => sizeSet.has(s));
  const extra = [...sizeSet].filter((s) => !SIZE_ORDER.includes(s)).sort();
  const allSizes = [...sizes, ...extra];

  return {
    rows: Array.from(grouped.values()).sort(
      (a, b) =>
        String(a.style).localeCompare(String(b.style)) ||
        String(a.color).localeCompare(String(b.color)),
    ),
    sizes: allSizes,
  };
}

export function printFinalReport(report, meta = {}) {
  if (!report?.length) {
    alert("No report data to print.");
    return;
  }

  const { rows, sizes } = pivotFinalReport(report);
  const generatedAt =
    meta.generatedAt ||
    new Date().toLocaleString("en-IN", { hour12: true });

  let header1 = `<tr><th rowspan="2" class="left">Style</th><th rowspan="2" class="left">Color</th>`;
  let header2 = "<tr>";
  for (const size of sizes) {
    header1 += `<th colspan="3">${size}</th>`;
    header2 += `<th>Order</th><th>Return</th><th>Stock</th>`;
  }
  header1 += "</tr>";
  header2 += "</tr>";

  let body = "";
  for (const row of rows) {
    body += `<tr><td class="left">${row.style}</td><td class="left">${row.color}</td>`;
    for (const size of sizes) {
      const d = row.sizes[size];
      if (!d) {
        body += "<td>-</td><td>-</td><td>-</td>";
      } else {
        const ret = d.used_return_qty ?? d.return_inventory ?? 0;
        const stock = d.need_from_stock ?? d.stock_inventory ?? 0;
        const retCls = ret > 0 ? ' class="return"' : "";
        body += `<td>${formatQty(d.total_order_qty)}</td>`;
        body += `<td${retCls}>${formatQty(ret)}</td>`;
        body += `<td>${formatQty(stock)}</td>`;
      }
    }
    body += "</tr>";
  }

  openPrintDocument(
    "Final Report",
    `<h1>Final Report</h1>
     <p class="meta">Generated: ${generatedAt}</p>
     <table><thead>${header1}${header2}</thead><tbody>${body}</tbody></table>`,
  );
}

export function printDailyReportRows(rows, meta = {}) {
  if (!rows?.length) {
    alert("No rows to print. Load the table first.");
    return;
  }

  const title = meta.title || "Daily Final Order Details";
  const subtitle = [
    meta.date && `Date: ${meta.date}`,
    meta.platform && `Platform: ${meta.platform}`,
  ]
    .filter(Boolean)
    .join(" · ");

  let body = "";
  for (const r of rows) {
    body += `<tr>
      <td>${r.date}</td>
      <td>${r.platform}</td>
      <td class="left">${r.style}</td>
      <td class="left">${r.color}</td>
      <td>${r.size}</td>
      <td>${r.total_order_qty}</td>
    </tr>`;
  }

  openPrintDocument(
    title,
    `<h1>${title}</h1>
     ${subtitle ? `<p class="meta">${subtitle}</p>` : ""}
     <table>
       <thead><tr>
         <th>Date</th><th>Platform</th>
         <th class="left">Style</th><th class="left">Color</th>
         <th>Size</th><th>Qty</th>
       </tr></thead>
       <tbody>${body}</tbody>
     </table>`,
  );
}

export function buildMarketplaceFormData(files) {
  const formData = new FormData();
  if (files.flipkart) formData.append("flipkart_file", files.flipkart);
  if (files.amazon) formData.append("amazon_file", files.amazon);
  if (files.ajio) formData.append("ajio_file", files.ajio);
  if (files.meesho) formData.append("meesho_file", files.meesho);
  if (files.myntra) formData.append("myntra_file", files.myntra);
  return formData;
}

export function hasMarketplaceFiles(files) {
  return !!(
    files.flipkart ||
    files.amazon ||
    files.ajio ||
    files.meesho ||
    files.myntra
  );
}
