import React from 'react';
import ItemDetailsPanel from './ItemDetailsPanel';
import type { ItemDetailsPanelProps } from './ItemDetailsPanel';

type ItemInspectorProps = Omit<ItemDetailsPanelProps, 'layout'>;

const ItemInspector: React.FC<ItemInspectorProps> = (props) => {
  if (!props.item) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 transition-opacity duration-200"
        onClick={props.onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-[520px] bg-slate-50 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        <ItemDetailsPanel {...props} layout="narrow" />
      </div>
    </>
  );
};

export default ItemInspector;
