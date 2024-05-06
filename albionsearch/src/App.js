import React, { useState, useEffect } from 'react';
import PouchDB from 'pouchdb-browser';
import items from './items.json';
import './App.css';
import { FaRegTrashAlt, FaHeart } from "react-icons/fa";
import { BiReset } from "react-icons/bi";
import { LuRefreshCcw } from "react-icons/lu";

const db = new PouchDB('itemsDB');
const favoriteDB = new PouchDB('favoritesDB'); // Nouvelle base de données pour les favoris

function App() {
    const [searchTerm, setSearchTerm] = useState('');
    const [filteredItems, setFilteredItems] = useState([]);
    const [dbItems, setDbItems] = useState([]);
    const [apiData, setApiData] = useState({});
    const [favorites, setFavorites] = useState([]);

    useEffect(() => {
        fetchDbItems();
    }, []);

    const fetchDbItems = async () => {
        try {
            const result = await db.allDocs({ include_docs: true, descending: true });
            const favResult = await favoriteDB.allDocs({ include_docs: true, descending: true }); // Récupérer les favoris depuis la nouvelle base de données
            setDbItems(result.rows.map(row => row.doc));
            setFavorites(favResult.rows.map(row => row.doc));
            fetchApiData(result.rows.map(row => row.doc));
        } catch (error) {
            console.error("Failed to fetch database items:", error.message);
        }
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
                const cityWithMinSellPrice = minSellPriceEntry ? minSellPriceEntry.city || 'Unknown' : 'Unknown';
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

    const addItemToDB = async (uniqueName, frName) => {
        try {
            const item = {
                _id: new Date().toISOString(),
                uniqueName,
                frName // Ajoutez la propriété pour le nom français
            };
            await db.put(item);
            fetchDbItems(); // Re-fetch items after adding
            setFilteredItems([]); // Close search results after adding
        } catch (error) {
            console.error("Failed to add item to database:", error.message);
        }
    };

    const deleteItemFromDB = async (item) => {
        try {
            if (window.confirm(`Voulais vous vraiment supprimer  "${item.frName}" du tableau?`)) {
                await db.remove(item);
                fetchDbItems(); // Re-fetch items after deleting
            }
        } catch (error) {
            console.error("Failed to delete item from database:", error.message);
        }
    };

    const addFavorite = async (item) => {
        try {
            // Vérifier si l'élément est déjà présent dans les favoris
            const existingFavorite = favorites.find(fav => fav.uniqueName === item.uniqueName);
            if (!existingFavorite) {
                // Générer un identifiant unique pour le nouvel élément
                const newId = `${item.uniqueName}_${new Date().getTime()}`;
                const newItem = { _id: newId, uniqueName: item.uniqueName, frName: item.frName };
                console.log(newItem)
                await favoriteDB.put(newItem); // Ajouter l'élément à la base de données des favoris
                setFavorites([...favorites, newItem]);
                setFilteredItems([]); // Fermer les résultats de recherche après l'ajout
            } else {
                console.log("Item already exists in favorites.");
            }
        } catch (error) {
            console.error("Failed to add favorite:", error.message);
        }
    };


    const removeFavorite = async (item) => {
        try {
            await favoriteDB.remove(item._id, item._rev); // Supprimer l'élément de la base de données des favoris
            setFavorites(favorites.filter(fav => fav._id !== item._id));
        } catch (error) {
            console.error("Failed to remove favorite:", error.message);
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

    const dropDataBase = async () => {
        try {
            const allDocs = await db.allDocs();
            await Promise.all(
                allDocs.rows.map(row => db.remove(row.id, row.value.rev))
            );
            setDbItems([]); // Clear local state after dropping the database
            setApiData({}); // Optionally clear the API data state if applicable
        } catch (error) {
            console.error("Failed to drop database:", error.message);
        }
    };

    const refreshData = async () => {
        try {
            await fetchDbItems();
        } catch (error) {
            console.error("Failed to refresh data:", error.message);
        }
    };

    // Tri des éléments en fonction des pourcentages de profit dans l'ordre décroissant
    const sortedItems = dbItems.slice().sort((a, b) => {
        if (!apiData[a._id] || !apiData[b._id]) return 0;
        return apiData[b._id].profitPercentage - apiData[a._id].profitPercentage;
    });

    return (

        <div className="App">
            <div className="layout">
                <h2>GOFASTBION</h2>
            </div>

            <div className="mainPanel">

                <div className="favorites-section">
                    <h3>Favoris</h3>
                    <table>
                        <thead>
                        <tr>
                            <th>Nom</th>
                            <th>Action</th>
                        </tr>
                        </thead>
                        <tbody>
                        {favorites.map((fav, index) => (
                            <tr key={index}>
                                <td onClick={() => addItemToDB(fav.uniqueName, fav.frName)}>
                                    {fav.frName || 'No translation available'}
                                </td>
                                <td>
                                    <button onClick={() => removeFavorite(fav)}><FaRegTrashAlt /></button>
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>

                <div className="dataApi">
                    <div className="search-bar">
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
                        <div className="panelButton">
                            <button onClick={dropDataBase}><BiReset /></button>
                            <button onClick={refreshData}><LuRefreshCcw /></button>

                        </div>
                    </div>


                    <div className="data-section">
                        <table className="data-table">
                            <thead>
                            <tr>
                                <th>Action</th>
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
                                    <tr className="data-row" >
                                        <td>
                                            <button onClick={() => addFavorite(item)}><FaHeart /> </button>
                                            <button onClick={() => deleteItemFromDB(item)}><FaRegTrashAlt /> </button>

                                        </td>
                                        <td>{item.frName}</td>
                                        {apiData[item._id] && typeof apiData[item._id].profitPercentage === 'number' ? (
                                            <>

                                                <td>{apiData[item._id].cityWithMinSellPrice}</td>
                                                <td>{apiData[item._id].minSellPrice}</td>
                                                <td>{apiData[item._id].cityWithMaxBuyPrice}</td>
                                                <td>{apiData[item._id].maxBuyPrice}</td>
                                                <td>{apiData[item._id].profitPercentage.toFixed(2)}%</td>
                                            </>
                                        ) : (
                                            <td colSpan="5">Data loading or unavailable...</td>
                                        )}
                                    </tr>
                                </React.Fragment>
                            ))}
                            </tbody>


                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default App;
