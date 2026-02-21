import { useState, useEffect, useMemo } from 'react';
import type { FlowRole } from '../teamHubApi';
import { fetchUserFlowRole } from '../teamHubApi';

export interface FlowPermissions {
  role: FlowRole | null;
  loading: boolean;
  canEditFlow: boolean;
  canDeleteFlow: boolean;
  canManageMembers: boolean;
  canManageLanes: boolean;
  canEditItems: boolean;
  canComment: boolean;
  canView: boolean;
  isOwner: boolean;
  isAdmin: boolean;
}

function derivePermissions(role: FlowRole | null): Omit<FlowPermissions, 'role' | 'loading'> {
  const isOwner = role === 'owner';
  const isAdmin = role === 'admin';
  const isMember = role === 'member';

  return {
    canEditFlow: isOwner || isAdmin,
    canDeleteFlow: isOwner,
    canManageMembers: isOwner || isAdmin,
    canManageLanes: isOwner || isAdmin,
    canEditItems: isOwner || isAdmin || isMember,
    canComment: isOwner || isAdmin || isMember,
    canView: role !== null,
    isOwner,
    isAdmin,
  };
}

export function useFlowPermissions(flowId: string | null, userId: string): FlowPermissions {
  const [role, setRole] = useState<FlowRole | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!flowId || !userId) {
      setRole(null);
      return;
    }

    setLoading(true);
    fetchUserFlowRole(flowId, userId)
      .then(r => setRole(r))
      .catch(() => setRole(null))
      .finally(() => setLoading(false));
  }, [flowId, userId]);

  return useMemo(() => ({
    role,
    loading,
    ...derivePermissions(role),
  }), [role, loading]);
}
