import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { User } from '../../types';
import { fetchInvoices, resendInvoice, voidInvoice, fetchPackages, deletePackage, type Invoice, type InvoicePackage } from '../../lib/invoices';
import InvoiceStatusBadge from '../../components/invoices/InvoiceStatusBadge';
import CreateInvoiceDrawer from '../../components/invoices/CreateInvoiceDrawer';
import PackageManagerDrawer from '../../components/invoices/PackageManagerDrawer';
import { PlusIcon, EditIcon, XIcon } from '../../components/Icons';

const formatCents = (cents: number, currency = 'usd'): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100);

type StatusFilter = 'all' | 'open' | 'paid' | 'void';
type PageTab = 'invoices' | 'packages';

const InvoicesPage: React.FC = () => {
  const { user, refreshProfile } = useOutletContext<{ user: User; refreshProfile: () => Promise<void> }>();
  const [pageTab, setPageTab] = useState<PageTab>('invoices');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Packages state
  const [packages, setPackages] = useState<InvoicePackage[]>([]);
  const [packagesLoading, setPackagesLoading] = useState(false);
  const [packageDrawerOpen, setPackageDrawerOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<InvoicePackage | undefined>();

  const load = async () => {
    try {
      setLoading(true);
      const data = await fetchInvoices();
      setInvoices(data);
    } catch (err) {
      console.error('Failed to load invoices:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadPackages = async () => {
    try {
      setPackagesLoading(true);
      const data = await fetchPackages();
      setPackages(data);
    } catch (err) {
      console.error('Failed to load packages:', err);
    } finally {
      setPackagesLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (pageTab === 'packages' && packages.length === 0 && !packagesLoading) {
      loadPackages();
    }
  }, [pageTab]);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return invoices;
    return invoices.filter((inv) => inv.status === statusFilter);
  }, [invoices, statusFilter]);

  // Stats
  const totalOutstanding = useMemo(
    () => invoices.filter((i) => i.status === 'open').reduce((sum, i) => sum + i.total_cents, 0),
    [invoices]
  );
  const totalCollected = useMemo(
    () => invoices.filter((i) => i.status === 'paid').reduce((sum, i) => sum + i.total_cents, 0),
    [invoices]
  );

  const handleResend = async (inv: Invoice) => {
    if (!confirm(`Resend invoice ${inv.invoice_number || inv.id.slice(0, 8)}?`)) return;
    try {
      setActionLoading(inv.id);
      await resendInvoice(inv.id);
      await load();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleVoid = async (inv: Invoice) => {
    if (!confirm(`Void invoice ${inv.invoice_number || inv.id.slice(0, 8)}? This cannot be undone.`)) return;
    try {
      setActionLoading(inv.id);
      await voidInvoice(inv.id);
      await load();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeletePackage = async (pkg: InvoicePackage) => {
    if (!confirm(`Delete package "${pkg.name}"? This cannot be undone.`)) return;
    try {
      await deletePackage(pkg.id);
      await loadPackages();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleEditPackage = (pkg: InvoicePackage) => {
    setEditingPackage(pkg);
    setPackageDrawerOpen(true);
  };

  const handleNewPackage = () => {
    setEditingPackage(undefined);
    setPackageDrawerOpen(true);
  };

  const filterTabs: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'open', label: 'Open' },
    { key: 'paid', label: 'Paid' },
    { key: 'void', label: 'Void' },
  ];

  const getPackageTotal = (pkg: InvoicePackage) =>
    pkg.items.reduce((sum, item) => sum + item.quantity * item.unit_price_cents, 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 font-heading">Invoices</h1>
          <p className="text-sm text-slate-500 mt-0.5">Create and manage invoices powered by Stripe</p>
        </div>
        <button
          onClick={pageTab === 'invoices' ? () => setDrawerOpen(true) : handleNewPackage}
          className="flex items-center space-x-2 px-4 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors text-sm"
        >
          <PlusIcon className="w-4 h-4" />
          <span>{pageTab === 'invoices' ? 'New Invoice' : 'New Package'}</span>
        </button>
      </div>

      {/* Page-level Tab Toggle */}
      <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => setPageTab('invoices')}
          className={`px-5 py-1.5 rounded-lg text-sm font-bold transition-colors ${
            pageTab === 'invoices'
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Invoices
        </button>
        <button
          onClick={() => setPageTab('packages')}
          className={`px-5 py-1.5 rounded-lg text-sm font-bold transition-colors ${
            pageTab === 'packages'
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Packages
        </button>
      </div>

      {pageTab === 'invoices' ? (
        <>
          {/* Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Outstanding</p>
              <p className="text-2xl font-bold text-blue-600 mt-1">{formatCents(totalOutstanding)}</p>
            </div>
            <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Collected</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">{formatCents(totalCollected)}</p>
            </div>
            <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Invoices</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">{invoices.length}</p>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl w-fit">
            {filterTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  statusFilter === tab.key
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Invoice Table */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 bg-white rounded-2xl border border-slate-200 shadow-sm text-center">
              <svg className="w-12 h-12 text-slate-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <p className="text-base font-bold text-slate-700 mb-1">No invoices yet</p>
              <p className="text-sm text-slate-400 mb-4">Send your first invoice to get started.</p>
              <button
                onClick={() => setDrawerOpen(true)}
                className="inline-flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors text-sm"
              >
                <PlusIcon className="w-4 h-4" />
                <span>New Invoice</span>
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left px-5 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">#</th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Client</th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Amount</th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Status</th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Due Date</th>
                    <th className="text-right px-5 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3.5 text-sm font-bold text-slate-800">
                        {inv.invoice_number || `INV-${inv.id.slice(0, 8)}`}
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="text-sm font-semibold text-slate-700">{inv.lead_name}</p>
                        <p className="text-xs text-slate-400">{inv.lead_email}</p>
                      </td>
                      <td className="px-5 py-3.5 text-sm font-bold text-slate-800">
                        {formatCents(inv.total_cents, inv.currency)}
                      </td>
                      <td className="px-5 py-3.5">
                        <InvoiceStatusBadge status={inv.status} />
                      </td>
                      <td className="px-5 py-3.5 text-sm text-slate-500">
                        {inv.due_date ? new Date(inv.due_date).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end space-x-3">
                          {inv.stripe_hosted_url && (
                            <a
                              href={inv.stripe_hosted_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
                            >
                              View
                            </a>
                          )}
                          {inv.status === 'open' && (
                            <>
                              <button
                                onClick={() => handleResend(inv)}
                                disabled={actionLoading === inv.id}
                                className="text-xs text-slate-500 hover:text-indigo-600 font-semibold disabled:opacity-50"
                              >
                                Resend
                              </button>
                              <button
                                onClick={() => handleVoid(inv)}
                                disabled={actionLoading === inv.id}
                                className="text-xs text-slate-500 hover:text-red-600 font-semibold disabled:opacity-50"
                              >
                                Void
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        /* ── Packages Tab ── */
        <>
          {packagesLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
            </div>
          ) : packages.length === 0 ? (
            <div className="p-12 bg-white rounded-2xl border border-slate-200 shadow-sm text-center">
              <svg className="w-12 h-12 text-slate-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
              </svg>
              <p className="text-base font-bold text-slate-700 mb-1">No packages yet</p>
              <p className="text-sm text-slate-400 mb-4">Create reusable packages to speed up invoice creation.</p>
              <button
                onClick={handleNewPackage}
                className="inline-flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors text-sm"
              >
                <PlusIcon className="w-4 h-4" />
                <span>New Package</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {packages.map((pkg) => (
                <div
                  key={pkg.id}
                  className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-slate-800 truncate">{pkg.name}</h3>
                      {pkg.description && (
                        <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{pkg.description}</p>
                      )}
                    </div>
                    <div className="flex items-center space-x-1 ml-2 shrink-0">
                      <button
                        onClick={() => handleEditPackage(pkg)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors"
                        title="Edit"
                      >
                        <EditIcon className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeletePackage(pkg)}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                        title="Delete"
                      >
                        <XIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                    <span className="text-xs text-slate-400 font-medium">
                      {pkg.items.length} item{pkg.items.length !== 1 ? 's' : ''}
                    </span>
                    <span className="text-sm font-bold text-slate-800">
                      {formatCents(getPackageTotal(pkg))}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Create Invoice Drawer */}
      <CreateInvoiceDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSuccess={load}
      />

      {/* Package Manager Drawer */}
      <PackageManagerDrawer
        open={packageDrawerOpen}
        onClose={() => {
          setPackageDrawerOpen(false);
          setEditingPackage(undefined);
        }}
        onSuccess={loadPackages}
        editingPackage={editingPackage}
      />
    </div>
  );
};

export default InvoicesPage;
