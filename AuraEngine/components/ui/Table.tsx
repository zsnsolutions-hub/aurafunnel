import React from 'react';

interface TableProps { children: React.ReactNode; className?: string; }
interface TableRowProps { children: React.ReactNode; className?: string; onClick?: () => void; }
interface TableCellProps { children: React.ReactNode; className?: string; }

export const Table: React.FC<TableProps> = ({ children, className = '' }) => (
  <div className={`overflow-x-auto bg-white border border-gray-200 rounded-xl ${className}`}>
    <table className="w-full text-sm text-left">{children}</table>
  </div>
);

export const TableHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <thead className="bg-gray-50/80 border-b border-gray-200">{children}</thead>
);

export const TableBody: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <tbody className="divide-y divide-gray-100">{children}</tbody>
);

export const TableRow: React.FC<TableRowProps> = ({ children, className = '', onClick }) => (
  <tr
    className={`transition-colors duration-150 ease-out hover:bg-gray-50 ${onClick ? 'cursor-pointer' : ''} ${className}`}
    onClick={onClick}
  >
    {children}
  </tr>
);

export const TableHead: React.FC<TableCellProps> = ({ children, className = '' }) => (
  <th className={`px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider ${className}`}>{children}</th>
);

export const TableCell: React.FC<TableCellProps> = ({ children, className = '' }) => (
  <td className={`px-6 py-4 text-gray-700 ${className}`}>{children}</td>
);
