<script setup lang="ts">
import { ROLE_DEFINITIONS, type Permission } from "@admin-x/shared";

const permissionLabels: Record<Permission, string> = {
  "audit:read": "查看审计",
  "business:manage": "管理业务",
  "dashboard:view": "查看工作台",
  "role:assign": "分配角色",
  "security:manage": "管理安全策略",
  "system:manage": "管理系统运行",
  "user:create": "创建账号",
  "user:delete": "删除账号",
  "user:read": "查看账号",
  "user:status": "启停账号",
};

function permissionLabel(permission: Permission) {
  return permissionLabels[permission];
}
</script>

<template>
  <div class="security-page">
    <div class="page-heading">
      <div>
        <p class="page-kicker">SECURITY POLICY</p>
        <h1>安全策略</h1>
        <p class="page-description">按最小权限和职责分离原则查看后台角色边界。</p>
      </div>
      <el-tag type="success" effect="light">三员分立已启用</el-tag>
    </div>

    <div class="principle-grid">
      <el-card shadow="never">
        <span class="principle-index">01</span>
        <strong>职责分离</strong>
        <p>系统运行、安全策略、审计监督分别由不同角色负责。</p>
      </el-card>
      <el-card shadow="never">
        <span class="principle-index">02</span>
        <strong>最小权限</strong>
        <p>角色只拥有完成岗位职责所需的页面和操作权限。</p>
      </el-card>
      <el-card shadow="never">
        <span class="principle-index">03</span>
        <strong>全程留痕</strong>
        <p>账号、角色、状态和密码等关键操作写入不可由业务角色删除的审计记录。</p>
      </el-card>
    </div>

    <el-card class="role-card" shadow="never">
      <template #header>
        <div class="card-heading">
          <div>
            <strong>角色权限矩阵</strong>
            <span>四类管理员角色互斥，普通用户不参与后台管理。</span>
          </div>
          <el-tag type="warning" effect="plain">权限变更由安全管理员负责</el-tag>
        </div>
      </template>
      <el-table :data="ROLE_DEFINITIONS" row-key="code">
        <el-table-column label="角色" min-width="145">
          <template #default="{ row }">
            <div class="role-cell">
              <strong>{{ row.label }}</strong>
              <small>{{ row.code }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="职责范围" min-width="260" prop="responsibilities" />
        <el-table-column label="权限" min-width="320">
          <template #default="{ row }">
            <div class="permission-tags">
              <el-tag
                v-for="permission in row.permissions"
                :key="permission"
                size="small"
                effect="plain"
              >
                {{ permissionLabel(permission) }}
              </el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="设计说明" min-width="330" prop="description" />
      </el-table>
    </el-card>
  </div>
</template>

<style scoped>
.security-page {
  max-width: 1440px;
  margin: 0 auto;
}

.page-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 26px;
}

.page-kicker {
  margin: 0 0 8px;
  color: var(--ax-primary);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.16em;
}

.page-heading h1 {
  margin: 0;
  color: var(--ax-heading);
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.05em;
}

.page-description {
  margin: 8px 0 0;
  color: var(--ax-muted);
  font-size: 12px;
}

.principle-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  margin-bottom: 16px;
}

.principle-grid :deep(.el-card__body) {
  min-height: 130px;
  padding: 20px;
}

.principle-index {
  display: block;
  margin-bottom: 14px;
  color: var(--ax-primary);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.16em;
}

.principle-grid strong {
  display: block;
  color: var(--ax-heading);
  font-size: 14px;
}

.principle-grid p {
  margin: 8px 0 0;
  color: var(--ax-muted);
  font-size: 11px;
  line-height: 1.7;
}

.role-card :deep(.el-card__body) {
  padding: 0;
}

.card-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.card-heading strong,
.card-heading span {
  display: block;
}

.card-heading strong {
  color: var(--ax-heading);
  font-size: 14px;
}

.card-heading span {
  margin-top: 5px;
  color: var(--ax-muted);
  font-size: 11px;
}

.role-card :deep(.el-table__header-wrapper th) {
  color: var(--ax-muted);
  background: var(--ax-surface-muted);
}

.role-card :deep(.el-table__row td) {
  color: var(--ax-content);
  border-bottom-color: var(--ax-line-soft);
}

.role-cell strong,
.role-cell small {
  display: block;
}

.role-cell strong {
  color: var(--ax-heading);
  font-size: 12px;
}

.role-cell small {
  margin-top: 4px;
  color: var(--ax-muted);
  font-size: 10px;
}

.permission-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

@media (max-width: 800px) {
  .principle-grid {
    grid-template-columns: 1fr;
  }

  .page-heading,
  .card-heading {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
