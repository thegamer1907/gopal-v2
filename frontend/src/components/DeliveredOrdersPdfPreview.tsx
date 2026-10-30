import {useEffect, useState} from 'react';
import {PreviewDeliveredOrdersPDF} from '../../wailsjs/go/main/App';
import type {reports} from '../../wailsjs/go/models';

// Inline preview of the Print Delivered Orders PDF: the Go side renders the same PDF the
// download would save and returns it base64; it's shown through the webview's built-in PDF
// viewer via a Blob URL (revoked on unmount).
export function DeliveredOrdersPdfPreview({entries}: {entries: reports.DeliveredOrdersPrintEntry[]}) {
    const [url, setUrl] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        let objectUrl = '';
        let cancelled = false;
        PreviewDeliveredOrdersPDF(entries)
            .then((b64) => {
                if (cancelled) return;
                const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
                objectUrl = URL.createObjectURL(new Blob([bytes], {type: 'application/pdf'}));
                setUrl(objectUrl);
            })
            .catch((e) => !cancelled && setError(String(e)));
        return () => {
            cancelled = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [entries]);

    if (error) return <p className="text-sm text-destructive">{error}</p>;
    if (!url) return <p className="text-sm text-muted-foreground">Preparing preview…</p>;
    return <iframe title="Delivered orders PDF preview" src={url} className="h-[calc(100vh-14rem)] w-full rounded-lg border"/>;
}
