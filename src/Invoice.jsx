import React, { useState, useEffect, useRef } from 'react';
import { useLanguage } from './LanguageContext';
import './invoice.css'

// --- APUFUNKTIOT ---
// Poistaa kaikki välilyönnit ennen laskentaa
const toNum = (val) => {
    if (typeof val === 'number') return val;
    const cleaned = (val || "").toString().replace(/\s/g, '').replace(',', '.');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
};

// Muotoilee luvun: 1234.5 -> "1 234,50"
const formatFinnish = (num) => {
    return new Intl.NumberFormat('fi-FI', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(num);
};

const roundToTwo = (num) => Math.round((num + Number.EPSILON) * 100) / 100;

const calculateFinnishReference = (number) => {
    const multipliers = [7, 3, 1];
    let sum = 0;
    const numStr = number.toString();
    for (let i = 0; i < numStr.length; i++) {
        const digit = parseInt(numStr.charAt(numStr.length - 1 - i), 10);
        sum += digit * multipliers[i % 3];
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    const ref = numStr + checkDigit;
    return ref.replace(/(.{5})/g, '$1 ').trim();
};

const formatDate = (date) => new Date(date).toLocaleDateString('fi-FI');

const addDays = (date, days) => {
    const result = new Date(date);
    result.setDate(result.getDate() + parseInt(days || 0));
    return result.toISOString().split('T')[0];
};

const Invoice = () => {
    const { t, lang, setLang } = useLanguage();
    const tableRef = useRef(null);

    // --- TILA (STATE) ---
    const [logo, setLogo] = useState(() => localStorage.getItem('invoice-logo') || null);
    const [deliveryDate, setDeliveryDate] = useState(() => localStorage.getItem('invoice-delivery-date') || "");
    const [vatExemptReason, setVatExemptReason] = useState("");
    const [status, setStatus] = useState('none');
    const [invoiceNumber, setInvoiceNumber] = useState('1001');
    const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
    const [paymentTerms, setPaymentTerms] = useState(14);
    const [penaltyInterest, setPenaltyInterest] = useState(() => localStorage.getItem('invoice-penalty') || 8);
    const [companyName, setCompanyName] = useState(() => localStorage.getItem('invoice-company-name') || 'Yritys Oy');
    const [IBAN, setIBAN] = useState(() => localStorage.getItem('invoice-IBAN') || 'FI12 3456 7890 1234 56');
    const [BIC, setBIC] = useState(() => localStorage.getItem('invoice-BIC') || 'XXXXXXXX');
    const [notes, setNotes] = useState(() => localStorage.getItem('invoice-notes') || "");
    const [savedCustomers, setSavedCustomers] = useState(() => JSON.parse(localStorage.getItem('invoice-customer-registry') || '[]'));
    const [customerInfo, setCustomerInfo] = useState(() => {
        const saved = localStorage.getItem('invoice-customer-info');
        return saved ? JSON.parse(saved) : {
            customerCompany: "Asiakkaan yritys",
            customerName: "Asiakkaan nimi",
            customerAddress: "Katuosoite 123",
            customerZip: "00100",
            customerCity: "Kaupunki"
        };
    });
    const [items, setItems] = useState(() => {
        const saved = localStorage.getItem('invoice-items');
        return saved ? JSON.parse(saved) : [{ id: Date.now(), desc: '', qty: 1, price: 0, tax: 25.5, discount: 0, unit: 'kpl' }];
    });

    // --- TALLENNUS ---
    useEffect(() => {
        localStorage.setItem('invoice-items', JSON.stringify(items));
        localStorage.setItem('invoice-customer-info', JSON.stringify(customerInfo));
        localStorage.setItem('invoice-customer-registry', JSON.stringify(savedCustomers));
        localStorage.setItem('invoice-num', invoiceNumber);
        localStorage.setItem('invoice-delivery-date', deliveryDate);
        localStorage.setItem('invoice-penalty', penaltyInterest);
        localStorage.setItem('invoice-notes', notes);
        localStorage.setItem('invoice-company-name', companyName);
        localStorage.setItem('invoice-IBAN', IBAN);
        localStorage.setItem('invoice-BIC', BIC);
    }, [items, customerInfo, savedCustomers, invoiceNumber, penaltyInterest, deliveryDate, notes, companyName, IBAN, BIC]);

    // --- LOGIIKKA ---
    const addItem = () => {
        setItems([...items, { id: Date.now(), desc: '', qty: 1, price: 0, tax: 25.5, discount: 0, unit: t.units.pcs || 'kpl' }]);
    };

    const removeItem = (id) => setItems(items.filter(i => i.id !== id));
    const updateItem = (id, field, val) => setItems(items.map(i => i.id === id ? { ...i, [field]: val } : i));

    const saveCurrentCustomer = () => {
        if (!savedCustomers.find(c => c.customerCompany === customerInfo.customerCompany)) {
            setSavedCustomers([...savedCustomers, customerInfo]);
        }
    };

    const generateVirtualBarcode = () => {
        const cleanIban = IBAN.replace(/\s/g, '').substring(2);
        const formattedAmount = roundToTwo(grandTotal).toFixed(2).replace('.', '').padStart(6, '0');
        const formattedRef = refNum.replace(/\s/g, '').padStart(20, '0');
        const formattedDate = dueDate.replace(/-/g, '').substring(2);
        return `4${cleanIban}${formattedAmount}000${formattedRef}${formattedDate}`;
    };

    const handleNumberOnly = (e) => {
        if (!/[0-9.,]/.test(e.key) && e.key.length === 1) e.preventDefault();
    };

    const handleTableNavigation = (e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            const focusables = tableRef.current.querySelectorAll('textarea, [contenteditable="true"], input, select');
            const index = Array.from(focusables).indexOf(document.activeElement);
            if (index > -1) {
                const nextIndex = e.key === 'ArrowUp' ? index - 6 : index + 6;
                if (focusables[nextIndex]) focusables[nextIndex].focus();
            }
        }
    };

    const getRowTotal = (item) => toNum(item.qty) * toNum(item.price) * (1 - (toNum(item.discount) / 100));

    // --- LASKENNAT ---
    const hasDiscounts = items.some(item => toNum(item.discount) > 0);
    const subtotal = items.reduce((acc, item) => acc + getRowTotal(item), 0);
    const totalDiscountAmount = items.reduce((acc, item) => acc + (toNum(item.qty) * toNum(item.price) * (toNum(item.discount) / 100)), 0);

    const taxSummary = items.reduce((acc, item) => {
        const taxAmt = getRowTotal(item) * (toNum(item.tax) / 100);
        acc[item.tax] = (acc[item.tax] || 0) + taxAmt;
        return acc;
    }, {});

    const vatBaseSummary = items.reduce((acc, item) => {
        acc[item.tax] = (acc[item.tax] || 0) + getRowTotal(item);
        return acc;
    }, {});

    const totalTax = Object.values(taxSummary).reduce((a, b) => a + b, 0);
    const grandTotal = roundToTwo(subtotal + totalTax);
    const dueDate = addDays(invoiceDate, paymentTerms);
    const refNum = calculateFinnishReference(invoiceNumber);

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="invoice-page" data-status={status} onKeyDown={handleTableNavigation}>
            {/* LASKUN SISÄLTÖ */}
            <div className="invoice-content">
                <div className="stamp">{status !== 'none' && t[status]}</div>
                {/* LASKUN HALLINTA - Yläreunassa, piilotetaan tulosteesta */}
                <div className="invoice-actions-bar no-print">
                    <div className="action-group">
                        <button onClick={handlePrint} className="btn-primary">Tulosta / PDF</button>

                        {/* UUSI KIELENVALITSIN */}
                        <div className="lang-selector">
                            <button
                                onClick={() => setLang('fi')}
                                className={`btn-lang ${lang === 'fi' ? 'active' : ''}`}
                            >FI</button>
                            <button
                                onClick={() => setLang('en')}
                                className={`btn-lang ${lang === 'en' ? 'active' : ''}`}
                            >EN</button>
                        </div>
                    </div>

                    <div className="action-group">
                        <select onChange={(e) => {
                            const selected = savedCustomers.find(c => c.customerCompany === e.target.value);
                            if (selected) setCustomerInfo(selected);
                        }} className="customer-select">
                            <option value="">Lataa asiakas...</option>
                            {savedCustomers.map(c => <option key={c.customerCompany} value={c.customerCompany}>{c.customerCompany}</option>)}
                        </select>
                        <button onClick={saveCurrentCustomer} className="btn-icon" title="Tallenna asiakas">💾</button>
                    </div>

                    <button onClick={() => { if (window.confirm("Tyhjennetäänkö kaikki?")) { localStorage.clear(); window.location.reload(); } }} className="btn-danger">Tyhjennä</button>
                </div>

                <div className="invoice-header">
                    <div className="logo-section">
                        {/* LOGON VALINTA JA NÄYTTÖ */}
                        {/* LOGO-OSIO: Mahtuu osoitekentän yläpuolelle */}
                        <div className="logo-wrapper-fixed">
                            <div className="logo-upload-zone no-print">
                                <input
                                    type="file"
                                    accept="image/*"
                                    id="logo-input"
                                    onChange={(e) => {
                                        const reader = new FileReader();
                                        reader.onloadend = () => setLogo(reader.result);
                                        if (e.target.files[0]) reader.readAsDataURL(e.target.files[0]);
                                    }}
                                />
                                <label htmlFor="logo-input">{logo ? 'Vaihda logo' : 'Lisää logo'}</label>
                                {logo && <button onClick={() => setLogo(null)} className="btn-remove-logo">×</button>}
                            </div>

                            {logo ? (
                                <img src={logo} alt="Logo" className="invoice-logo" />
                            ) : (
                                <div className="logo-placeholder no-print">LOGO</div>
                            )}
                        </div>

                        {/* ASIAKASTIEDOT LOGON ALLA */}
                        <div className="customer-info-box-fixed">
                            {/* Tämä on se "vastaanottaja" -teksti */}
                            <label className="customer-label no-print">
                                {t.customer || 'Vastaanottaja'}:
                            </label>

                            <div className="customer-details-container">
                                <div contentEditable suppressContentEditableWarning onBlur={(e) => setCustomerInfo({ ...customerInfo, customerCompany: e.target.innerText })} className="customer-field">{customerInfo.customerCompany}</div>
                                <div contentEditable suppressContentEditableWarning onBlur={(e) => setCustomerInfo({ ...customerInfo, customerName: e.target.innerText })} className="customer-field">{customerInfo.customerName}</div>
                                <div contentEditable suppressContentEditableWarning onBlur={(e) => setCustomerInfo({ ...customerInfo, customerAddress: e.target.innerText })} className="customer-field">{customerInfo.customerAddress}</div>
                                <div className="customer-row-flex">
                                    <span contentEditable suppressContentEditableWarning onBlur={(e) => setCustomerInfo({ ...customerInfo, customerZip: e.target.innerText })} className="customer-field zip-field">{customerInfo.customerZip}</span>
                                    <span contentEditable suppressContentEditableWarning onBlur={(e) => setCustomerInfo({ ...customerInfo, customerCity: e.target.innerText })} className="customer-field city-field">{customerInfo.customerCity}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    {/* Muu yläosa... */}
                    <div className="invoice-header-info">
                        <h1 className="invoice-title">{t.title}</h1>
                        <div className="info-grid">
                            <span className="info-label">{t.invoiceNo}:</span>
                            <input type="number" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className="editable-input" style={{ width: '80px' }} />

                            <span className="info-label">{t.invoiceDate}:</span>
                            <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="editable-input no-print" />
                            <span className="info-value print-only">{formatDate(invoiceDate)}</span>

                            <span className="info-label">{t.paymentTermsLabel}:</span>
                            <div className="input-with-unit">
                                <input type="number" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} className="editable-input" style={{ width: '60px' }} />
                                <span className="unit-text">{lang === 'fi' ? 'vrk' : 'days'}</span>
                            </div>

                            <span className="info-label">{t.dueDate}:</span>
                            <span className="info-value highlight">{formatDate(dueDate)}</span>

                            <span className={`info-label ${!deliveryDate ? 'no-print' : ''}`}>{t.deliveryDate}:</span>
                            <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className={`editable-input ${!deliveryDate ? 'no-print' : ''}`} />

                            <span className={`info-label ${!penaltyInterest ? 'no-print' : ''}`}>{t.penaltyInterestLabel}:</span>
                            <div className={`input-with-unit ${!penaltyInterest ? 'no-print' : ''}`}>
                                <input type="number" value={penaltyInterest} onChange={(e) => setPenaltyInterest(e.target.value)} className="editable-input no-print" style={{ width: '60px' }} />
                                <span className="info-value print-only">{penaltyInterest} %</span>
                                <span className="unit-text no-print">%</span>
                            </div>
                        </div>
                    </div>
                </div>
                {/* LISÄTIEDOT - Tulostetaan vain jos tekstiä on */}
                <div className={`notes-area-wrapper ${!notes || notes.trim() === "" ? 'no-print' : ''}`}>
                    <label className="customer-label no-print">Lisätiedot:</label>
                    <div
                        contentEditable
                        suppressContentEditableWarning
                        onBlur={(e) => setNotes(e.target.innerText)}
                        className="notes-editor"
                        data-placeholder="Kirjoita vapaamuotoista tekstiä tästä..."
                    >
                        {notes}
                    </div>
                </div>
                {/* TUOTETAULUKKO */}
                <table className="invoice-table" ref={tableRef}>
                    <thead>
                        <tr>
                            <th>{t.desc}</th>
                            <th className="col-align-right">{t.qty}</th>
                            <th className="col-unit">{t.unit}</th>
                            <th className="col-align-right">{t.price}</th>
                            <th className={`col-align-center ${!hasDiscounts ? 'no-print' : ''}`}> {t.disc} </th>
                            <th className="col-align-center">{t.tax}</th>
                            <th className="col-total">{t.total}</th>
                            <th className="no-print"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map(item => (
                            <tr key={item.id}>
                                <td className="col-desc">
                                    <textarea
                                        className="table-input"
                                        value={item.desc}
                                        rows="1"
                                        onChange={(e) => {
                                            // Tämä kikka nollaa korkeuden ja asettaa sen scrollHeightin mukaan
                                            e.target.style.height = 'inherit';
                                            e.target.style.height = `${e.target.scrollHeight}px`;
                                            updateItem(item.id, 'desc', e.target.value);
                                        }}
                                        // Varmistaa oikean korkeuden myös ladattaessa
                                        ref={el => {
                                            if (el) {
                                                el.style.height = 'inherit';
                                                el.style.height = `${el.scrollHeight}px`;
                                            }
                                        }}
                                    />
                                </td>
                                <td className="col-align-right"
                                    contentEditable
                                    suppressContentEditableWarning
                                    onKeyPress={handleNumberOnly}
                                    onBlur={(e) => updateItem(item.id, 'qty', toNum(e.target.innerText))}
                                >
                                    {item.qty}
                                </td>
                                <td className="col-unit">
                                    <input className="unit-editable"
                                        list={`units-${item.id}`}
                                        className="unit-input-combobox"
                                        value={item.unit || ''}
                                        placeholder={t.unitPlaceholder || "Yks."}
                                        onChange={(e) => updateItem(item.id, 'unit', e.target.value)}
                                        onFocus={(e) => e.target.setAttribute('autocomplete', 'off')}
                                        onClick={(e) => {
                                            const temp = e.target.value;
                                            e.target.value = '';
                                            e.target.value = temp;

                                        }}
                                        title="Valitse listasta tai kirjoita oma"
                                    />
                                    <datalist id={`units-${item.id}`}>
                                        {Object.entries(t.units).map(([key, label]) => (
                                            < option key={key} value={label} />
                                        ))}
                                    </datalist>

                                </td>
                                <td contentEditable suppressContentEditableWarning onKeyPress={handleNumberOnly} onBlur={(e) => updateItem(item.id, 'price', toNum(e.target.innerText))} style={{ textAlign: 'right' }}>{item.price}</td>
                                <td className={!hasDiscounts ? 'no-print' : ''} contentEditable suppressContentEditableWarning onBlur={(e) => updateItem(item.id, 'discount', toNum(e.target.innerText))} style={{ textAlign: 'right' }}>{item.discount}</td>
                                <td className="col-align-center">
                                    <select className="table-input" value={item.tax} onChange={(e) => updateItem(item.id, 'tax', e.target.value)}>
                                        <option value="25.5">25,5</option>
                                        <option value="24">24</option>
                                        <option value="14">14</option>
                                        <option value="13.5">13,5</option>
                                        <option value="10">10</option>
                                        <option value="0">0</option>
                                    </select>
                                </td>
                                <td className="col-total">
                                    {formatFinnish(getRowTotal(item))} €
                                </td>
                                <td className="no-print" style={{ verticalAlign: 'middle', width: '30px' }}>
                                    <button
                                        onClick={() => removeItem(item.id)}
                                        className="delete-btn"
                                        title="Poista rivi"
                                    >
                                        <svg viewBox="0 0 24 24">
                                            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                                        </svg>
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {/* LISÄÄ RIVI -PAINIKE TAULUKON ALLA */}
                <div className="add-row-container no-print">
                    <button onClick={addItem} className="btn-add-row">
                        <span className="icon">+</span> {t.add || 'Lisää rivi'}
                    </button>
                </div>
                {/* Erittely */}
                <div className="summary-container">
                    {totalDiscountAmount > 0 && <div className="summary-line discount-text">
                        <span>{t.totalDiscount || 'Alennus yhteensä'}:</span>
                        <span>-{formatFinnish(totalDiscountAmount)} €</span></div>}
                    <div className="summary-line"><span>{t.subtotal}</span><span>{formatFinnish(subtotal)} €</span></div>
                    {/* ALV-ERITTELY (Veron perusteet) */}
                    <div className="vat-summary-section">
                        {Object.entries(taxSummary).map(([rate, amount]) => {
                            if (toNum(amount) === 0 && toNum(vatBaseSummary[rate]) === 0) return null;
                            return (
                                <div key={rate} className="vat-summary-line">
                                    <span className="vat-label">ALV {rate.replace('.', ',')}% peruste: </span>
                                    <span className="vat-value">{formatFinnish(vatBaseSummary[rate])} €</span>
                                    <span className="vat-label"> </span>
                                    <span className="vat-label">Vero: </span>
                                    <span className="vat-value">{formatFinnish(amount)} €</span>
                                </div>
                            );
                        })}
                    </div>
                    <div className="summary-line total-bold"><span>{t.grandTotal}</span><span>{formatFinnish(grandTotal)} €</span></div>
                </div>

                <div className="invoice-footer-container">
                    {/* MAKSUTIEDOT*/}
                    <div className="payment-summary-box triple-col-grid">
                        {/* SARAKE 1: SAAJA JA ERÄPÄIVÄ */}
                        <div className="payment-col">
                            <div className="payment-item">
                                <span className="label">Saaja / Payee</span>
                                <input
                                    className="editable-input-bold value"
                                    value={companyName}
                                    onChange={(e) => setCompanyName(e.target.value)}
                                />
                            </div>
                            <div className="payment-item mt-auto">
                                <span className="label">Eräpäivä / Due Date</span>
                                <span className="value">{formatDate(dueDate)}</span>
                            </div>
                        </div>

                        {/* SARAKE 2: IBAN JA VIITE */}
                        <div className="payment-col border-left">
                            <div className="payment-item">
                                <span className="label">Tilinumero / IBAN</span>
                                <input
                                    className="editable-input-bold value"
                                    value={IBAN}
                                    onChange={(e) => setIBAN(e.target.value)}
                                />
                            </div>
                            <div className="payment-item mt-auto">
                                <span className="label">Viitenumero / Ref. No</span>
                                <span className="value">{refNum}</span>
                            </div>
                        </div>

                        {/* SARAKE 3: BIC JA SUMMA (Kaikki oikealle) */}
                        <div className="payment-col border-left text-right">
                            <div className="payment-item">
                                <span className="label">BIC / SWIFT</span>
                                <input
                                    className="editable-input-bold value text-right"
                                    value={BIC}
                                    onChange={(e) => setBIC(e.target.value)}
                                />
                            </div>
                            <div className="payment-item highlight mt-auto">
                                <span className="label">Maksettavaa / To Pay</span>
                                <span className="value">{formatFinnish(grandTotal)} €</span>
                            </div>
                        </div>
                    </div>

                    {/* VIRTUAALIVIIVAKOODI */}
                    <div className="barcode-section">
                        <div className="barcode-label">VIRTUAALIVIIVAKOODI / VIRTUAL BARCODE</div>
                        <div className="barcode-string">{generateVirtualBarcode()}</div>
                    </div>

                    {/* YRITYKSEN YHTEYSTIEDOT*/}
                    <div className="company-info-grid">
                        <div className="info-col">
                            <h4 className="info-heading">&nbsp;</h4>
                            <div className="info-text-box"><strong>{companyName}</strong><br />Katuosoite 1<br />00100 Helsinki</div>
                        </div>
                        <div className="info-col">
                            <h4 className="info-heading">Tunnukset</h4>
                            <div className="info-text-box">Y-tunnus: 1234567-8<br />ALV-nro: FI12345678<br /><strong>ALV-rekisterissä</strong></div>
                        </div>
                        <div className="info-col">
                            <h4 className="info-heading">Verkkolaskuosoite</h4>
                            <div className="info-text-box">OVT: 003712345678<br />Välittäjä: BAWCFI22</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Invoice;
