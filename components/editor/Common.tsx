
import React from 'react';
import { DurationUnit } from '../../types';

export const UnitSelector: React.FC<{ value: DurationUnit, onChange: (u: DurationUnit) => void }> = ({ value, onChange }) => (
  <div className="flex bg-slate-900 rounded p-0.5 border border-slate-700">
    <button onClick={() => onChange('ms')} className={`px-2 py-0.5 text-[8px] font-black uppercase rounded ${value === 'ms' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500'}`}>ms</button>
    <button onClick={() => onChange('beat')} className={`px-2 py-0.5 text-[8px] font-black uppercase rounded ${value === 'beat' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500'}`}>beat</button>
  </div>
);
