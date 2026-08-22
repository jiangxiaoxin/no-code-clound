export const PERMISSIONS = {
  ADMIN_ACCESS: 'admin.access',
  USERS_READ: 'users.read',
  USERS_CREATE: 'users.create',
  USERS_UPDATE: 'users.update',
  USERS_CHANGE_STATUS: 'users.change_status',
  USERS_RESET_PASSWORD: 'users.reset_password',
  USERS_ASSIGN_DEPARTMENTS: 'users.assign_departments',
  USERS_ASSIGN_ROLES: 'users.assign_roles',
  DEPARTMENTS_READ: 'departments.read',
  DEPARTMENTS_CREATE: 'departments.create',
  DEPARTMENTS_UPDATE: 'departments.update',
  DEPARTMENTS_DELETE: 'departments.delete',
  ROLES_READ: 'roles.read',
  ROLES_CREATE: 'roles.create',
  ROLES_UPDATE: 'roles.update',
  ROLES_DELETE: 'roles.delete',
  ROLES_ASSIGN_PERMISSIONS: 'roles.assign_permissions',
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS = Object.values(PERMISSIONS);

export interface AuthPrincipal {
  id: number;
  username: string;
  email: string;
  displayName: string;
  status: 'active';
  departmentIds: number[];
  roleCodes: string[];
  permissions: string[];
}

export interface PermissionItem {
  code: string;
  name: string;
}

export interface PermissionGroup {
  module: string;
  permissions: PermissionItem[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    module: '管理后台',
    permissions: [{ code: PERMISSIONS.ADMIN_ACCESS, name: '进入管理后台' }],
  },
  {
    module: '人员管理',
    permissions: [
      { code: PERMISSIONS.USERS_READ, name: '查看人员' },
      { code: PERMISSIONS.USERS_CREATE, name: '新建人员' },
      { code: PERMISSIONS.USERS_UPDATE, name: '编辑人员' },
      { code: PERMISSIONS.USERS_CHANGE_STATUS, name: '启停人员' },
      { code: PERMISSIONS.USERS_RESET_PASSWORD, name: '重置密码' },
      { code: PERMISSIONS.USERS_ASSIGN_DEPARTMENTS, name: '分配部门' },
      { code: PERMISSIONS.USERS_ASSIGN_ROLES, name: '分配角色' },
    ],
  },
  {
    module: '部门管理',
    permissions: [
      { code: PERMISSIONS.DEPARTMENTS_READ, name: '查看部门' },
      { code: PERMISSIONS.DEPARTMENTS_CREATE, name: '新建部门' },
      { code: PERMISSIONS.DEPARTMENTS_UPDATE, name: '编辑部门' },
      { code: PERMISSIONS.DEPARTMENTS_DELETE, name: '删除部门' },
    ],
  },
  {
    module: '角色管理',
    permissions: [
      { code: PERMISSIONS.ROLES_READ, name: '查看角色' },
      { code: PERMISSIONS.ROLES_CREATE, name: '新建角色' },
      { code: PERMISSIONS.ROLES_UPDATE, name: '编辑角色' },
      { code: PERMISSIONS.ROLES_DELETE, name: '删除角色' },
      { code: PERMISSIONS.ROLES_ASSIGN_PERMISSIONS, name: '配置权限' },
    ],
  },
];

export function isKnownPermission(code: string): boolean {
  return ALL_PERMISSIONS.includes(code as PermissionCode);
}
