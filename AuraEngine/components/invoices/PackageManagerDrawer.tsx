import React, { useState, useEffect } from 'react';
import { Drawer } from '../ui/Drawer';
import { savePackage, type InvoicePackage } from '../../lib/invoices';
import { PlusIcon, XIcon } from '../Icons';

interface PackageManagerDrawerProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editingPackage?: InvoicePackage;
}

interface PackageLineItem {
  _key: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
}

const emptyItem = (): PackageLineItem => ({
  _key: crypto.randomUUID(),
  description: '',
  quantity: 1,
  unit_price_cents: 0,
});

const PackageManagerDrawer: React.FC<PackageManagerDrawerProps> = ({
  open,
  onClose,
  onSuccess,
  editingPackage,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [items, setItems] = useState<PackageLineItem[]>([emptyItem()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Reset form when drawer opens
  useEffect(() => {
    if (open) {
      if (editingPackage) {
        setName(editingPackage.name);
        setDescription(editingPackage.description || '');
        setItems(
          editingPackage.items.length > 0
            ? editingPackage.items.map((item) => ({
                _key: crypto.randomUUID(),
                description: item.description,
                quantity: item.quantity,
                unit_price_cents: item.unit_price_cents,
              }))
            : [emptyItem()]
        );
      } else {
        setName('');
        setDescription('');
        setItems([emptyItem()]);
      }
      setError('');
    }
  }, [open, editingPackage]);

  const updateItem = (index: number, field: string, value: any) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const addItem = () => {
    setItems((prev) => [...prev, emptyItem()]);
  };

  const subtotalCents = items.reduce(
    (sum, item) => sum + (item.quantity || 0) * (item.unit_price_cents || 0),
    0
  );

  const formatDollars = (cents: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

  const handleSave = async () => {
    setError('');

    if (!name.trim()) {
      setError('Please enter a package name.');
      return;
    }

    const validItems = items.filter(
      (item) => item.description.trim() && item.unit_price_cents > 0
    );
    if (validItems.length === 0) {
      setError('Add at least one item with a description and price.');
      return;
    }

    try {
      setSaving(true);
      await savePackage({
        id: editingPackage?.id,
        name: name.trim(),
        description: description.trim() || undefined,
        items: validItems.map(({ description, quantity, unit_price_cents }) => ({
          description,
          quantity,
          unit_price_cents,
        })),
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={editingPackage ? 'Edit Package' : 'New Package'}
      width="w-[580px]"
    >
      <div className="space-y-6">
        {/* Package Name */}
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-1.5">Package Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Starter Website Package"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-1.5">
            Description <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Brief description of what this package includes..."
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
          />
        </div>

        {/* Line Items */}
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-1.5">Line Items</label>
          <div className="space-y-3">
            {items.map((item, index) => (
              <div key={item._key} className="flex items-start space-x-2">
                <div className="flex-grow">
                  <input
                    type="text"
                    value={item.description}
                    onChange={(e) => updateItem(index, 'description', e.target.value)}
                    placeholder="Description"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                  />
                </div>
                <div className="w-20">
                  <input
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 1)}
                    placeholder="Qty"
                    className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                  />
                </div>
                <div className="w-28">
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={item.unit_price_cents ? (item.unit_price_cents / 100).toFixed(2) : ''}
                      onChange={(e) =>
                        updateItem(index, 'unit_price_cents', Math.round(parseFloat(e.target.value || '0') * 100))
                      }
                      placeholder="0.00"
                      className="w-full pl-6 pr-2 py-2 border border-slate-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                    />
                  </div>
                </div>
                <button
                  onClick={() => removeItem(index)}
                  disabled={items.length <= 1}
                  className="p-2 text-slate-300 hover:text-red-500 disabled:opacity-30 transition-colors"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={addItem}
            className="mt-2 flex items-center space-x-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            <span>Add line item</span>
          </button>
        </div>

        {/* Summary */}
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-600">Package Total</span>
            <span className="text-lg font-bold text-slate-800">{formatDollars(subtotalCents)}</span>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-medium">
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
        >
          {saving ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Saving...</span>
            </>
          ) : (
            <span>{editingPackage ? 'Update Package' : 'Save Package'}</span>
          )}
        </button>
      </div>
    </Drawer>
  );
};

export default PackageManagerDrawer;
