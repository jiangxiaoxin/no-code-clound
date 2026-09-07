import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { UserDepartment } from '../../admin/department/user-department.entity';
import { Department } from '../../admin/department/department.entity';
import { Role } from '../../admin/role/role.entity';
import { UserRole } from '../../admin/role/user-role.entity';
import { User } from '../../user/user.entity';
import { ApproverRule } from './workflow.types';

export type ResolvedApprovers = {
  userIds: number[];
  emptyReason?: string;
  unrestrictedByMissingDept?: boolean;
};

@Injectable()
export class WorkflowApproverService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    @InjectRepository(UserRole)
    private readonly userRoleRepo: Repository<UserRole>,
    @InjectRepository(UserDepartment)
    private readonly userDepartmentRepo: Repository<UserDepartment>,
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
  ) {}

  async resolve(input: {
    nodeTitle: string;
    approver: ApproverRule;
    initiatorId: number;
    recordData: Record<string, unknown>;
  }): Promise<ResolvedApprovers> {
    const collected = new Set<number>();
    const specified = await this.activeUserIds(input.approver.userIds || []);
    specified.forEach((id) => collected.add(id));

    const memberIds = collectMemberFieldIds(
      input.recordData,
      input.approver.memberFieldKeys || [],
    );
    const members = await this.activeUserIds(memberIds);
    members.forEach((id) => collected.add(id));

    const sameDept = input.approver.sameDeptAsInitiator !== false;
    const roleResult = await this.resolveRoleUsers(
      input.approver.roleIds || [],
      input.initiatorId,
      sameDept,
    );
    roleResult.userIds.forEach((id) => collected.add(id));

    if (input.approver.deptLeaderOfInitiator) {
      const leaderIds = await this.resolveInitiatorDeptLeader(input.initiatorId);
      leaderIds.forEach((id) => collected.add(id));
    }

    if (collected.size === 0) {
      const othersConfigured =
        (input.approver.userIds || []).length > 0 ||
        (input.approver.roleIds || []).length > 0 ||
        (input.approver.memberFieldKeys || []).length > 0;
      if (input.approver.deptLeaderOfInitiator && !othersConfigured) {
        return {
          userIds: [],
          emptyReason: `节点「${input.nodeTitle}」没有可用的发起人部门负责人`,
        };
      }
      if (roleResult.deptIntersectionEmpty) {
        return {
          userIds: [],
          emptyReason: `节点「${input.nodeTitle}」在发起人所在部门没有可用的审批人`,
        };
      }
      return {
        userIds: [],
        emptyReason: `节点「${input.nodeTitle}」没有可用的审批人`,
      };
    }

    return {
      userIds: [...collected],
      unrestrictedByMissingDept: roleResult.unrestrictedByMissingDept || undefined,
    };
  }

  private async activeUserIds(ids: number[]): Promise<number[]> {
    const unique = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
    if (!unique.length) return [];
    const rows = await this.userRepo.find({
      where: { id: In(unique), status: 'active' },
    });
    return rows.map((row) => row.id);
  }

  private async resolveInitiatorDeptLeader(initiatorId: number): Promise<number[]> {
    const link = await this.userDepartmentRepo.findOne({
      where: { userId: initiatorId },
    });
    if (!link) return [];
    const department = await this.departmentRepo.findOne({
      where: { id: link.departmentId },
    });
    if (!department?.leaderUserId) return [];
    return this.activeUserIds([department.leaderUserId]);
  }

  private async resolveRoleUsers(
    roleIds: number[],
    initiatorId: number,
    sameDept: boolean,
  ): Promise<{
    userIds: number[];
    unrestrictedByMissingDept: boolean;
    deptIntersectionEmpty: boolean;
  }> {
    const uniqueRoles = [...new Set(roleIds.filter((id) => Number.isInteger(id) && id > 0))];
    if (!uniqueRoles.length) {
      return { userIds: [], unrestrictedByMissingDept: false, deptIntersectionEmpty: false };
    }
    const roles = await this.roleRepo.find({
      where: { id: In(uniqueRoles), status: 'active' },
    });
    if (!roles.length) {
      return { userIds: [], unrestrictedByMissingDept: false, deptIntersectionEmpty: false };
    }
    const activeRoleIds = roles.map((role) => role.id);
    const links = await this.userRoleRepo.find({
      where: { roleId: In(activeRoleIds) },
    });
    const candidateIds = [...new Set(links.map((link) => link.userId))];
    const active = await this.activeUserIds(candidateIds);
    if (!active.length) {
      return { userIds: [], unrestrictedByMissingDept: false, deptIntersectionEmpty: false };
    }
    if (!sameDept) {
      return { userIds: active, unrestrictedByMissingDept: false, deptIntersectionEmpty: false };
    }
    const initiatorDept = await this.userDepartmentRepo.findOne({
      where: { userId: initiatorId },
    });
    if (!initiatorDept) {
      return { userIds: active, unrestrictedByMissingDept: true, deptIntersectionEmpty: false };
    }
    const inDept = await this.userDepartmentRepo.find({
      where: { userId: In(active), departmentId: initiatorDept.departmentId },
    });
    const intersected = inDept.map((row) => row.userId);
    if (!intersected.length) {
      return { userIds: [], unrestrictedByMissingDept: false, deptIntersectionEmpty: true };
    }
    return {
      userIds: intersected,
      unrestrictedByMissingDept: false,
      deptIntersectionEmpty: false,
    };
  }
}

function collectMemberFieldIds(
  recordData: Record<string, unknown>,
  keys: string[],
): number[] {
  const ids: number[] = [];
  for (const key of keys) {
    const value = recordData[key];
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
      ids.push(value);
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'number' && Number.isInteger(item) && item > 0) {
          ids.push(item);
        }
      }
    }
  }
  return ids;
}
