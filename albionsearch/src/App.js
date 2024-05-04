import React, { useState, useEffect } from 'react';
import PouchDB from 'pouchdb-browser';
import items from './items.json';
import './App.css'; // Importation du fichier CSS

const db = new PouchDB('itemsDB');

function App() {
    const [searchTerm, setSearchTerm] = useState('');
    const [filteredItems, setFilteredItems] = useState([]);
    const [dbItems, setDbItems] = useState([]);
    const [apiData, setApiData] = useState({});
    const [darkMode, setDarkMode] = useState(false); // État pour suivre le mode sombre

    useEffect(() => {
        fetchDbItems();
    }, []);

    const fetchDbItems = async () => {
        const result = await db.allDocs({ include_docs: true, descending: true });
        setDbItems(result.rows.map(row => row.doc));
        fetchApiData(result.rows.map(row => row.doc)); // Fetch API data when items are loaded
    };

    const fetchApiData = async (itemsFromDB) => {
        for (const item of itemsFromDB) {
            try {
                const response = await fetch(`https://europe.albion-online-data.com/api/v2/stats/prices/${item.uniqueName}?locations=Thetford,Martlock,Lymhurst,Caerleon,Bridgewatch,FortSterling`);
                if (!response.ok) throw new Error('Failed to fetch data');
                const data = await response.json();
                // Exclude "Black Market" (city ID: 301) from calculations and entries where sell_price_min or buy_price_max is 0
                const filteredData = data.filter(entry => entry.city !== 'Black Market' && entry.city !== 301 && entry.sell_price_min > 0 && entry.buy_price_max > 0);
                // Find the city with the lowest sell price
                const minSellPriceEntry = filteredData.reduce((min, entry) => entry.sell_price_min < min.sell_price_min ? entry : min, filteredData[0]);
                const cityWithMinSellPrice = minSellPriceEntry.city || 'Unknown';
                const minSellPrice = minSellPriceEntry.sell_price_min || 0;
                // Find the city with the highest buy price
                const maxBuyPriceEntry = filteredData.reduce((max, entry) => entry.buy_price_max > max.buy_price_max ? entry : max, filteredData[0]);
                const cityWithMaxBuyPrice = maxBuyPriceEntry.city || 'Unknown';
                const maxBuyPrice = maxBuyPriceEntry.buy_price_max || 0;
                // Calculate profit percentage
                const profitPercentage = minSellPrice !== 0 ? ((maxBuyPrice - minSellPrice) / minSellPrice) * 100 : 0;
                setApiData(prevData => ({ ...prevData, [item._id]: { cityWithMinSellPrice, minSellPrice, cityWithMaxBuyPrice, maxBuyPrice, profitPercentage } }));
            } catch (error) {
                console.error("Failed to fetch data:", error.message);
                setApiData(prevData => ({ ...prevData, [item._id]: { error: error.message } }));
            }
        }
    };

    const updateFilteredItems = (search) => {
        const filtered = items.filter(item =>
            item.LocalizedNames?.['FR-FR']?.toLowerCase().includes(search.toLowerCase())
        ).slice(0, 10); // Limit the results to 10
        setFilteredItems(filtered);
    };

    const handleSearchChange = (event) => {
        const { value } = event.target;
        setSearchTerm(value);
        updateFilteredItems(value);
    };

    const addItemToDB = async (uniqueName, frName) => {
        const item = {
            _id: new Date().toISOString(),
            uniqueName,
            frName // Ajoutez la propriété pour le nom français
        };
        await db.put(item);
        fetchDbItems(); // Re-fetch items after adding
    };

    const deleteItemFromDB = async (item) => {
        if (window.confirm(`Are you sure you want to delete "${item.uniqueName}" from the database?`)) {
            await db.remove(item);
            fetchDbItems(); // Re-fetch items after deleting
        }
    };

    // Tri des éléments en fonction des pourcentages de profit dans l'ordre décroissant
    const sortedItems = dbItems.slice().sort((a, b) => {
        if (!apiData[a._id] || !apiData[b._id]) return 0;
        return apiData[b._id].profitPercentage - apiData[a._id].profitPercentage;
    });

    // Utilisez la valeur de darkMode pour conditionnellement appliquer des classes CSS
    const appContainerClass = darkMode ? 'app-container dark-mode' : 'app-container';

    // La fonction pour basculer entre le mode sombre et le mode clair
    const toggleDarkMode = () => {
        setDarkMode(!darkMode);
    };

    return (
        <div className={appContainerClass}>
            <div className="search-section">
                <input
                    type="text"
                    className="search-input"
                    placeholder="Rechercher un item"
                    value={searchTerm}
                    onChange={handleSearchChange}
                />
                <ul className="search-results">
                    {filteredItems.map((item, index) => (
                        <li key={index} onClick={() => addItemToDB(item.UniqueName, item.LocalizedNames?.['FR-FR'])}>
                            {item.LocalizedNames?.['FR-FR'] || 'No translation available'}
                        </li>
                    ))}
                </ul>
            </div>
            <div className="data-section">
                <table className="data-table">
                    <thead>
                    <tr>
                        <th>Nom</th>
                        <th>Ville de départ</th>
                        <th>Prix de d'achat</th>
                        <th>Ville d'arrivé </th>
                        <th>Prix de vente</th>
                        <th>Profit</th>
                    </tr>
                    </thead>
                    <tbody>
                    {sortedItems.map((item, index) => (
                        <React.Fragment key={index}>
                            <tr className="data-row" onClick={() => deleteItemFromDB(item)}>
                                <td>{item.frName}</td>
                                {apiData[item._id] && (
                                    <>
                                        <td>{apiData[item._id].cityWithMinSellPrice}</td>
                                        <td>{apiData[item._id].minSellPrice}</td>
                                        <td>{apiData[item._id].cityWithMaxBuyPrice}</td>
                                        <td>{apiData[item._id].maxBuyPrice}</td>
                                        <td>{apiData[item._id].profitPercentage.toFixed(2)}%</td>
                                    </>
                                )}
                            </tr>
                        </React.Fragment>
                    ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default App;
