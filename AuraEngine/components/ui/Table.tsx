import React from 'react';

interface TableProps { children: React.ReactNode; className?: string; }
interface TableRowProps { children: React.ReactNode; className?: string; onClick?: () => void; }
interface TableCellProps { children: React.ReactNode; className?: string; }

export const Table: React.FC<TableProps> = ({ children, className = '' }) => (
  <div className={`overflow-x-auto bg-white border border-gray-200 rounded-2xl shadow-sm ${className}`}>
    <table className="w-full text-sm">{children}</table>
  </div>
);

export const TableHeader: React.FC<{ children: React.ReactNode; sticky?: boolean }> = ({ children, sticky = false }) => (
  <thead className={`bg-gray-50/80 border-b border-gray-200 ${sticky ? 'sticky top-0 z-10 backdrop-blur-sm' : ''}`}>{children}</thead>
);

export const TableBody: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <tbody className="divide-y divide-gray-100">{children}</tbody>
);

export const TableRow: React.FC<TableRowProps> = ({ children, className = '', onClick }) => (
  <tr
    className={`group transition-colors duration-150 ease-out hover:bg-gray-50/80 ${onClick ? 'cursor-pointer' : ''} ${className}`}
    onClick={onClick}
  >
    {children}
  </tr>
);

export const TableHead: React.FC<TableCellProps> = ({ children, className = '' }) => (
  <th className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${className}`}>{children}</th>
);

export const TableCell: React.FC<TableCellProps> = ({ children, className = '' }) => (
  <td className={`px-6 py-4 text-gray-700 ${className}`}>{children}</td>
);

export const TableRowActions: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 ease-out ${className}`}>
    {children}
  </div>
);
