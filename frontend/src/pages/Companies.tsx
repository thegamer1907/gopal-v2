import {useEffect, useState} from 'react';
import {Building2, Plus} from 'lucide-react';
import {AddCompany, ListCompanies} from '../../wailsjs/go/main/App';
import {db} from '../../wailsjs/go/models';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {useUnsavedChanges} from '@/components/UnsavedChanges';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';

// Company master — maintains the list of companies bills can be raised against.
// Just a name for now; more columns to follow. See docs/DATA_MODEL.md (companies).
export function Companies() {
    const [companies, setCompanies] = useState<db.Company[]>([]);
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const {setDirty} = useUnsavedChanges();

    // Name is mandatory — Add is enabled only when it's filled; dirty (warn before
    // leaving) once it has content.
    const isValid = name.trim() !== '';
    const isDirty = isValid;

    useEffect(() => {
        setDirty(isDirty);
    }, [isDirty, setDirty]);
    // Clear the guard if we unmount (e.g. after confirming "switch anyway").
    useEffect(() => () => setDirty(false), [setDirty]);

    async function refresh() {
        try {
            setCompanies(await ListCompanies());
            setError('');
        } catch (e: any) {
            setError(String(e));
        }
    }

    useEffect(() => {
        refresh();
    }, []);

    async function add() {
        if (!isValid) return;
        try {
            await AddCompany(name.trim());
            setName('');
            await refresh();
        } catch (e: any) {
            setError(String(e));
        }
    }

    return (
        <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
                {companies.length} {companies.length === 1 ? 'company' : 'companies'}
            </p>

            <Card>
                <CardHeader>
                    <CardTitle>Add company</CardTitle>
                    <CardDescription>Create a new company in the master list.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form
                        className="flex flex-wrap items-end gap-3"
                        onSubmit={(e) => {
                            e.preventDefault();
                            add();
                        }}
                    >
                        <div className="grid flex-1 gap-2 min-w-48">
                            <Label htmlFor="name">Company name</Label>
                            <Input
                                id="name"
                                placeholder="e.g. Acme Supplies"
                                autoComplete="off"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                            />
                        </div>
                        <Button type="submit" disabled={!isValid}>
                            <Plus className="size-4"/>
                            Add
                        </Button>
                    </form>
                    {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Companies</CardTitle>
                </CardHeader>
                <CardContent>
                    {companies.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
                            <Building2 className="size-8 opacity-40"/>
                            <p className="text-sm">No companies yet. Add one above to get started.</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Company</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {companies.map((c) => (
                                    <TableRow key={c.id}>
                                        <TableCell className="font-medium">{c.name}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
