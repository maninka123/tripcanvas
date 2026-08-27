'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { CURRENCY_OPTIONS, currencyCodeForCountry, flagIconUrl, useCurrency } from '@/lib/currency';

export function CurrencySwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const { selection, setSelection, currency, localCountry, info } = useCurrency();
  const [open, setOpen] = useState(false);
  const localCode = currencyCodeForCountry(localCountry);
  const [base, ...rest] = CURRENCY_OPTIONS;
  const options: { code: string; label: string }[] = [
    { code: base, label: base },
    ...(localCode ? [{ code: 'LOCAL', label: `Local · ${localCode}` }] : []),
    ...rest.map((code) => ({ code, label: code })),
  ];
  const activeInfo = info(currency);
  return (
    <div className="currency-switch">
      <button type="button" className="currency-trigger" onClick={() => setOpen((value) => !value)} aria-haspopup="listbox" aria-expanded={open} title={`Currency: ${currency}`}>
        <img className="flag-icon" src={flagIconUrl(activeInfo.flagCode)} alt=""/>{!collapsed && <><span className="currency-code">{currency}</span><ChevronDown size={12}/></>}
      </button>
      {open && <>
        <button type="button" className="currency-backdrop" aria-label="Close currency menu" onClick={() => setOpen(false)}/>
        <div className="currency-menu" role="listbox">
          <p>DISPLAY CURRENCY</p>
          {options.map(({ code, label }) => {
            const displayCode = code === 'LOCAL' ? (localCode ?? 'AUD') : code;
            const optionInfo = info(displayCode);
            return (
              <button key={code} type="button" role="option" aria-selected={selection === code} className={selection === code ? 'active' : ''} onClick={() => { setSelection(code); setOpen(false); }}>
                <img className="flag-icon" src={flagIconUrl(optionInfo.flagCode)} alt=""/>
                <div><strong>{label}</strong><small>{optionInfo.name}</small></div>
              </button>
            );
          })}
        </div>
      </>}
    </div>
  );
}
