import {useEffect, useState} from 'react';
import './App.css';
import {AddItem, ListItems} from "../wailsjs/go/main/App";
import {db} from "../wailsjs/go/models";

// Minimal items screen — proves the Go <-> frontend <-> SQLite round-trip.
// This is a skeleton and will be replaced by the real inventory UI.
function App() {
    const [items, setItems] = useState<db.Item[]>([]);
    const [name, setName] = useState('');
    const [quantity, setQuantity] = useState('1');
    const [error, setError] = useState('');

    async function refresh() {
        try {
            setItems(await ListItems());
        } catch (e: any) {
            setError(String(e));
        }
    }

    useEffect(() => {
        refresh();
    }, []);

    async function add() {
        const trimmed = name.trim();
        if (!trimmed) return;
        try {
            await AddItem(trimmed, parseInt(quantity, 10) || 0);
            setName('');
            setQuantity('1');
            setError('');
            await refresh();
        } catch (e: any) {
            setError(String(e));
        }
    }

    return (
        <div id="App">
            <h1>Inventory</h1>

            <div className="input-box">
                <input
                    className="input"
                    placeholder="Item name"
                    value={name}
                    autoComplete="off"
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && add()}
                />
                <input
                    className="input"
                    type="number"
                    min="0"
                    style={{maxWidth: 80}}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && add()}
                />
                <button className="btn" onClick={add}>Add</button>
            </div>

            {error && <div style={{color: '#ff6b6b'}}>{error}</div>}

            {items.length === 0 ? (
                <p>No items yet. Add one above.</p>
            ) : (
                <table style={{margin: '1rem auto', borderCollapse: 'collapse'}}>
                    <thead>
                        <tr>
                            <th style={{padding: '4px 16px'}}>Name</th>
                            <th style={{padding: '4px 16px'}}>Quantity</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((it) => (
                            <tr key={it.id}>
                                <td style={{padding: '4px 16px'}}>{it.name}</td>
                                <td style={{padding: '4px 16px'}}>{it.quantity}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}

export default App;
