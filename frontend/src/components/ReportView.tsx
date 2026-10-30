import type {ReactNode} from 'react';
import {ArrowLeft} from 'lucide-react';
import {Button} from '@/components/ui/button';

// Full-page shell for an on-screen report (Reports → View): Back on the left, the report's
// title + one-line summary, and the Download button on the right. The body is passed in
// (a ReportTable, or the PDF preview frame).
export function ReportView({title, summary, onBack, downloadLabel, onDownload, downloading, notice, error, children}: {
    title: string;
    summary: string;
    onBack: () => void;
    downloadLabel: string;
    onDownload: () => void;
    downloading: boolean;
    notice: string;
    error: string;
    children: ReactNode;
}) {
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
                <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
                    <ArrowLeft className="size-4"/>
                    Back
                </Button>
                <Button variant="outline" size="sm" onClick={onDownload} disabled={downloading}>
                    {downloading ? 'Preparing…' : downloadLabel}
                </Button>
            </div>
            <div>
                <h1 className="text-lg font-semibold">{title}</h1>
                <p className="text-sm text-muted-foreground">{summary}</p>
            </div>
            {notice && <p className="text-sm text-emerald-600">{notice}</p>}
            {error && <p className="text-sm text-destructive">{error}</p>}
            {children}
        </div>
    );
}
