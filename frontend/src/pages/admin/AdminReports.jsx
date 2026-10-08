import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { useAdminData } from "../../hooks/useAdminData";
import { useToast } from "../../context/useToast";
import { adminApi } from "../../frontApi";
import AdminPageTitle from "../../components/admin/AdminPageTitle";
import { BarChart, ProportionBar } from "../../components/ui/Charts";
import { formatCedis } from "../../utils/reports";
import { buildAdminReport } from "../../utils/adminReport";

const ReportCard = ({ title, description, total, children, className = "" }) => (
  <section className={`rounded-lg bg-white p-6 ring-1 ring-slate-200 ${className}`}>
    <div className="mb-5 flex items-start justify-between gap-4">
      <div><h2 className="font-bold text-gray-900">{title}</h2><p className="text-sm text-gray-500">{description}</p></div>
      {total != null && <p className="shrink-0 text-right text-xl font-semibold text-gray-900 tabular-nums">{total}</p>}
    </div>
    {children}
  </section>
);

const AdminReports = () => {
  const { users, listings, inquiries, payments, siteName } = useAdminData();
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);
  const report = buildAdminReport({ users, listings, inquiries, payments });

  const downloadReport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const [snapshot, { downloadAdminReport }] = await Promise.all([adminApi.getReportSnapshot(), import("../../utils/reportPdf")]);
      await downloadAdminReport(buildAdminReport(snapshot), siteName);
      toast({ title: "Report downloaded", description: "Your six-month report has been saved as a PDF." });
    } catch (error) {
      toast({ title: "Couldn't download report", description: error.message || "Please try again.", type: "error" });
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <AdminPageTitle title="Reports" description="Platform trends over the last 6 months, calculated from the records in the database." action={<button type="button" onClick={downloadReport} disabled={exporting} aria-busy={exporting} className="btn btn-primary disabled:cursor-wait disabled:opacity-60">{exporting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}{exporting ? "Preparing PDF…" : "Download PDF"}</button>} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {report.sections.map((section) => (
          <ReportCard key={section.key} title={section.title} description={section.description} total={section.total == null ? null : section.currency ? formatCedis(section.total) : section.total} className={section.wide ? "lg:col-span-2" : ""}>
            <BarChart title={`${section.title} per month`} data={section.data} series={section.series} format={section.currency ? formatCedis : undefined} height={section.wide ? 220 : 180} />
          </ReportCard>
        ))}
        <ReportCard title="Active vs expired subscriptions" description="Current state of all agent subscriptions" className="lg:col-span-2">
          <ProportionBar segments={report.statuses} />
        </ReportCard>
      </div>
    </>
  );
};

export default AdminReports;
