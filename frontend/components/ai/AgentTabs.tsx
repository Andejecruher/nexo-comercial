'use client';

import { DepartmentSelector } from '@/components/ai/DepartmentSelector';
import { LineForm } from '@/components/ai/LineForm';
import { ModelConfigForm } from '@/components/ai/ModelConfigForm';
import { PhoneLineCard } from '@/components/ai/PhoneLineCard';
import { PromptEditor } from '@/components/ai/PromptEditor';
import { PromptVersions } from '@/components/ai/PromptVersions';
import { ToolForm } from '@/components/ai/ToolForm';
import { ToolList } from '@/components/ai/ToolList';
import { TopicForm } from '@/components/ai/TopicForm';
import { AgentTopicAssignments } from '@/components/ai/AgentTopicAssignments';
import { DepartmentForm } from '@/components/shared/catalogs/DepartmentForm';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAgentAssignments } from '@/hooks/ai/useAgentAssignments';
import { useAgentDetail } from '@/hooks/ai/useAgentDetail';
import type {
  AiAgent,
  AiPrompt,
  AiTool,
  AiTopic,
  CommunicationLine,
  CreateLinePayload,
  CreatePromptPayload,
  CreateToolPayload,
  CreateTopicPayload,
  UpdateAgentPayload,
  UpdateLinePayload,
} from '@/lib/shared/ai-api';
import { agentsApi, linesApi, promptsApi, toolsApi, topicsApi } from '@/lib/shared/ai-api';
import { AI_PROVIDER_LABELS } from '@/lib/ai/ai-model-config';
import type { Department } from '@/lib/shared/catalog-api';
import { departmentsApi } from '@/lib/shared/catalog-api';
import {
  BookOpen,
  Bot,
  Building2,
  FileText,
  Loader2,
  Phone,
  PhoneIncoming,
  Plus,
  Sliders,
  Wrench,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

interface AgentTabsProps {
  agent: AiAgent;
  onAgentUpdated?: (agent: AiAgent) => void;
}

// ─── Dialog state helpers ─────────────────────────────────────────────────────

type ToolDialog = { open: false } | { open: true; tool?: AiTool };
type TopicDialog = { open: false } | { open: true; topic?: AiTopic };
type PromptDialog = { open: false } | { open: true; prompt?: AiPrompt };
type DeptDialog = { open: false } | { open: true; dept?: Department };

export function AgentTabs({ agent, onAgentUpdated }: AgentTabsProps) {
  const { data, loading, error, refresh } = useAgentDetail(agent.id);
  const [lineFormOpen, setLineFormOpen] = useState(false);
  const [editingLine, setEditingLine] = useState<CommunicationLine | undefined>(undefined);

  // Keep local agent state so assignments update the badge counts immediately
  const [localAgent, setLocalAgent] = useState<AiAgent>(agent);
  useEffect(() => setLocalAgent(agent), [agent]);

  // ─── Dialog states ──────────────────────────────────────────────────────────
  const [toolDialog, setToolDialog] = useState<ToolDialog>({ open: false });
  const [topicDialog, setTopicDialog] = useState<TopicDialog>({ open: false });
  const [promptDialog, setPromptDialog] = useState<PromptDialog>({ open: false });
  const [deptDialog, setDeptDialog] = useState<DeptDialog>({ open: false });

  const handleAgentUpdated = (updated: AiAgent) => {
    setLocalAgent(updated);
    onAgentUpdated?.(updated);
  };

  const { getAssigned, toggle, saving } = useAgentAssignments(localAgent, handleAgentUpdated);

  const topicAssignments = data?.topicAssignments ?? [];
  const assignedTopicIds = topicAssignments.map((item) => item.topicId);
  const assignedToolIds = [
    ...new Set(
      (data?.topics ?? [])
        .filter((topic) => assignedTopicIds.includes(topic.id))
        .flatMap((topic) =>
          (topic.tools ?? []).filter((tool) => tool.isActive).map((tool) => tool.id),
        ),
    ),
  ];
  const assignedPromptIds = [
    ...new Set(
      topicAssignments
        .filter((item) => item.topic.isActive)
        .map((item) =>
          item.prompt.isActive
            ? item.promptId
            : item.topic.systemPrompt?.isActive
              ? item.topic.systemPrompt.id
              : undefined,
        )
        .filter((id): id is string => !!id),
    ),
  ];
  const assignedDeptIds = getAssigned('departmentIds');

  // ─── Model config ───────────────────────────────────────────────────────────

  const handleSaveModel = async (payload: UpdateAgentPayload) => {
    const result = await agentsApi.update(localAgent.id, payload);
    if (result.ok) {
      toast.success('Configuración guardada');
      handleAgentUpdated(result.data.agent);
      await refresh();
      return { success: true };
    } else {
      toast.error('Error al guardar', { description: result.message });
      return { success: false, error: result.message };
    }
  };

  // ─── Line handlers ──────────────────────────────────────────────────────────

  const handleUpdateLine = async (id: string, payload: UpdateLinePayload) => {
    const result = await linesApi.update(id, payload);
    if (result.ok) {
      toast.success('Línea actualizada');
      await refresh();
      return { success: true };
    } else {
      toast.error('Error al actualizar línea', { description: result.message });
      return { success: false, error: result.message };
    }
  };

  const handleUnassignLine = async (lineId: string) => {
    // agentId: null removes the assignment on the backend.
    const result = await linesApi.update(lineId, { agentId: null });
    if (result.ok) {
      toast.success('Línea desasignada');
      await refresh();
    } else {
      toast.error('Error al desasignar línea', { description: result.message });
    }
  };

  const handleCreateLine = async (
    payload: CreateLinePayload,
  ): Promise<{ success: boolean; error?: string }> => {
    const result = await linesApi.create(payload);
    if (result.ok) {
      toast.success('Línea creada y asignada al agente');
      await refresh();
      return { success: true };
    }
    toast.error('Error al crear línea', { description: result.message });
    return { success: false, error: result.message };
  };

  // ─── Prompt handlers ────────────────────────────────────────────────────────

  const handleActivatePrompt = async (promptId: string) => {
    const result = await promptsApi.update(promptId, { isActive: true });
    if (result.ok) {
      toast.success('Prompt activado');
      await refresh();
    } else {
      toast.error('Error al activar prompt', { description: result.message });
    }
  };

  // ─── CRUD: Tools ────────────────────────────────────────────────────────────

  const handleToolSubmit = async (
    payload: CreateToolPayload,
  ): Promise<{ success: boolean; error?: string }> => {
    if (toolDialog.open && toolDialog.tool) {
      const result = await toolsApi.update(toolDialog.tool.id, payload);
      if (result.ok) {
        toast.success('Herramienta actualizada');
        await refresh();
        return { success: true };
      }
      toast.error('Error al actualizar', { description: result.message });
      return { success: false, error: result.message };
    }
    // Create
    const result = await toolsApi.create(payload);
    if (result.ok) {
      toast.success('Herramienta creada');
      await refresh();
      return { success: true };
    }
    toast.error('Error al crear herramienta', { description: result.message });
    return { success: false, error: result.message };
  };

  // ─── CRUD: Topics ───────────────────────────────────────────────────────────

  const handleTopicSubmit = async (
    payload: CreateTopicPayload,
  ): Promise<{ success: boolean; error?: string }> => {
    if (topicDialog.open && topicDialog.topic) {
      const result = await topicsApi.update(topicDialog.topic.id, payload);
      if (result.ok) {
        toast.success('Tópico actualizado');
        await refresh();
        return { success: true };
      }
      toast.error('Error al actualizar', { description: result.message });
      return { success: false, error: result.message };
    }
    const result = await topicsApi.create(payload);
    if (result.ok) {
      toast.success('Tópico creado');
      await refresh();
      return { success: true };
    }
    toast.error('Error al crear tópico', { description: result.message });
    return { success: false, error: result.message };
  };

  // ─── CRUD: Prompts ──────────────────────────────────────────────────────────

  const handlePromptSubmit = async (
    payload: CreatePromptPayload,
  ): Promise<{ success: boolean; error?: string }> => {
    if (promptDialog.open && promptDialog.prompt) {
      const result = await promptsApi.update(promptDialog.prompt.id, payload);
      if (result.ok) {
        toast.success(`Prompt guardado (v${promptDialog.prompt.version + 1})`);
        await refresh();
        return { success: true };
      }
      toast.error('Error al guardar prompt', { description: result.message });
      return { success: false, error: result.message };
    }
    const result = await promptsApi.create(payload);
    if (result.ok) {
      toast.success('Prompt creado');
      await refresh();
      return { success: true };
    }
    toast.error('Error al crear prompt', { description: result.message });
    return { success: false, error: result.message };
  };

  // ─── CRUD: Departments ──────────────────────────────────────────────────────

  const handleDeptSubmit = async (payload: {
    slug: string;
    name: string;
    description?: string;
    isActive?: boolean;
    keywords?: string[];
  }): Promise<{ success: boolean; error?: string }> => {
    if (deptDialog.open && deptDialog.dept) {
      const result = await departmentsApi.update(deptDialog.dept.id, payload);
      if (result.ok) {
        toast.success('Departamento actualizado');
        await refresh();
        return { success: true };
      }
      toast.error('Error al actualizar', { description: result.message });
      return { success: false, error: result.message };
    }
    const result = await departmentsApi.create(payload);
    if (result.ok) {
      toast.success('Departamento creado');
      await toggle('departmentIds', result.data.department.id);
      await refresh();
      return { success: true };
    }
    toast.error('Error al crear departamento', { description: result.message });
    return { success: false, error: result.message };
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Cargando detalle del agente…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
        {error}
      </div>
    );
  }

  const lines = data?.lines ?? [];
  const topics = data?.topics ?? [];
  const tools = data?.tools ?? [];
  const prompts = data?.prompts ?? [];

  return (
    <>
      <Tabs defaultValue="general" className="flex flex-col gap-4">
        <TabsList className="h-9 w-full justify-start gap-0 bg-muted/50 p-0.5 overflow-x-auto">
          <TabsTrigger value="general" className="gap-1.5 text-xs h-8">
            <Bot className="w-3.5 h-3.5" />
            General
          </TabsTrigger>
          <TabsTrigger value="tools" className="gap-1.5 text-xs h-8">
            <Wrench className="w-3.5 h-3.5" />
            Tools
            {assignedToolIds.length > 0 && (
              <Badge variant="secondary" className="text-xs px-1.5 py-0 ml-0.5">
                {assignedToolIds.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="topics" className="gap-1.5 text-xs h-8">
            <BookOpen className="w-3.5 h-3.5" />
            Tópicos
            {assignedTopicIds.length > 0 && (
              <Badge variant="secondary" className="text-xs px-1.5 py-0 ml-0.5">
                {assignedTopicIds.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="prompts" className="gap-1.5 text-xs h-8">
            <FileText className="w-3.5 h-3.5" />
            Prompts
            {assignedPromptIds.length > 0 && (
              <Badge variant="secondary" className="text-xs px-1.5 py-0 ml-0.5">
                {assignedPromptIds.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="phone-lines" className="gap-1.5 text-xs h-8">
            <Phone className="w-3.5 h-3.5" />
            Líneas
            {lines.length > 0 && (
              <Badge variant="secondary" className="text-xs px-1.5 py-0 ml-0.5">
                {lines.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="departments" className="gap-1.5 text-xs h-8">
            <Building2 className="w-3.5 h-3.5" />
            Departamentos
            {assignedDeptIds.length > 0 && (
              <Badge variant="secondary" className="text-xs px-1.5 py-0 ml-0.5">
                {assignedDeptIds.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="model-config" className="gap-1.5 text-xs h-8">
            <Sliders className="w-3.5 h-3.5" />
            Modelo
          </TabsTrigger>
        </TabsList>

        {/* General */}
        <TabsContent value="general" className="mt-0">
          <div className="flex flex-col gap-4 max-w-lg">
            <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 border border-purple-500/20">
                  <Bot className="w-5 h-5 text-purple-500" />
                </div>
                <div>
                  <p className="font-semibold">{localAgent.name}</p>
                  <code className="text-xs text-muted-foreground font-mono">{localAgent.slug}</code>
                </div>
              </div>
              {localAgent.description && (
                <p className="text-sm text-muted-foreground">{localAgent.description}</p>
              )}
              <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/50">
                <Badge variant="outline" className="text-xs">
                  {AI_PROVIDER_LABELS[localAgent.provider]}
                </Badge>
                <Badge variant="secondary" className="text-xs font-mono">
                  {localAgent.model}
                </Badge>
                {localAgent.temperature !== undefined && localAgent.temperature !== null && (
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    T: {localAgent.temperature}
                  </Badge>
                )}
                {localAgent.maxTokens !== undefined && localAgent.maxTokens !== null && (
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    {localAgent.maxTokens} tokens
                  </Badge>
                )}
                <Badge variant={localAgent.isActive ? 'default' : 'secondary'} className="text-xs">
                  {localAgent.isActive ? 'Activo' : 'Inactivo'}
                </Badge>
              </div>
            </div>

            {/* Summary counts */}
            <div className="rounded-lg border p-3 text-sm flex flex-col gap-2">
              <p className="font-medium">Configuración para responder</p>
              {!localAgent.isActive && <p className="text-destructive">El agente está inactivo.</p>}
              {!lines.some((line) => line.isActive && line.aiEnabled) && (
                <p className="text-destructive">Falta una línea activa con IA habilitada.</p>
              )}
              {topicAssignments.length === 0 && (
                <p className="text-destructive">
                  Falta conectar un tópico y un prompt en la pestaña Tópicos.
                </p>
              )}
              {topicAssignments.map((item) => {
                const prompt = item.prompt.isActive ? item.prompt : item.topic.systemPrompt;
                return (
                  <p
                    key={item.id}
                    className={
                      !item.topic.isActive || !prompt?.isActive
                        ? 'text-destructive'
                        : 'text-muted-foreground'
                    }
                  >
                    {item.topic.name} → {prompt?.name ?? 'Sin prompt'}
                    {item.isDefault ? ' · Predeterminado' : ''}
                    {!item.topic.isActive
                      ? ' · Tópico inactivo'
                      : !prompt?.isActive
                        ? ' · Sin prompt activo'
                        : ''}
                  </p>
                );
              })}
              <p className="text-xs text-muted-foreground">
                La entrega también requiere credenciales válidas, webhook y proveedor de IA
                disponibles.
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Líneas', count: lines.length, icon: Phone },
                { label: 'Tools asignadas', count: assignedToolIds.length, icon: Wrench },
                { label: 'Tópicos', count: assignedTopicIds.length, icon: BookOpen },
                { label: 'Departamentos', count: assignedDeptIds.length, icon: Building2 },
              ].map(({ label, count, icon: Icon }) => (
                <div
                  key={label}
                  className="flex flex-col items-center gap-1 rounded-lg border bg-card p-3 text-center"
                >
                  <Icon className="w-4 h-4 text-muted-foreground" />
                  <p className="text-lg font-bold">{count}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Tools */}
        <TabsContent value="tools" className="mt-0">
          <div className="flex flex-col gap-3">
            {/* Tab header actions */}
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {assignedToolIds.length} tool(s) asignada(s) · {tools.length} disponibles
              </p>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => setToolDialog({ open: true })}
              >
                <Plus className="w-3.5 h-3.5" />
                Nueva tool
              </Button>
            </div>
            <ToolList
              tools={tools}
              loading={loading && !data}
              selectedIds={assignedToolIds}
              onEdit={(tool) => setToolDialog({ open: true, tool })}
            />
            <p className="text-xs text-muted-foreground">
              Las herramientas se habilitan por tópico. En Tópicos, usa «Editar tópico y
              herramientas» para asignarlas.
            </p>
          </div>
        </TabsContent>

        {/* Topics */}
        <TabsContent value="topics" className="mt-0">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {assignedTopicIds.length} tópico(s) asignado(s) · {topics.length} disponibles
              </p>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => setTopicDialog({ open: true })}
              >
                <Plus className="w-3.5 h-3.5" />
                Nuevo tópico
              </Button>
            </div>
            <AgentTopicAssignments
              key={`${localAgent.id}:${JSON.stringify(topicAssignments.map(({ topicId, promptId, priority, isDefault }) => ({ topicId, promptId, priority, isDefault })))}`}
              agentId={localAgent.id}
              assignments={topicAssignments}
              topics={topics}
              prompts={prompts}
              onSaved={refresh}
              onEditTopic={(topic) => setTopicDialog({ open: true, topic })}
            />
          </div>
        </TabsContent>

        {/* Prompts */}
        <TabsContent value="prompts" className="mt-0">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {assignedPromptIds.length} prompt(s) asignado(s) · {prompts.length} disponibles
              </p>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => setPromptDialog({ open: true })}
              >
                <Plus className="w-3.5 h-3.5" />
                Nuevo prompt
              </Button>
            </div>
            <PromptVersions
              prompts={prompts}
              loading={loading && !data}
              selectedIds={assignedPromptIds}
              onActivate={(p) => void handleActivatePrompt(p.id)}
              onEdit={(prompt) => setPromptDialog({ open: true, prompt })}
            />
            <p className="text-xs text-muted-foreground">
              Asigna cada prompt a un tópico desde la pestaña Tópicos. Crear o activar un prompt no
              lo conecta automáticamente al agente.
            </p>
          </div>
        </TabsContent>

        {/* Phone Lines */}
        <TabsContent value="phone-lines" className="mt-0">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {lines.length} línea(s) asignada(s) a este agente
              </p>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => {
                  setEditingLine(undefined);
                  setLineFormOpen(true);
                }}
              >
                <PhoneIncoming className="w-3.5 h-3.5" />
                Nueva línea
              </Button>
            </div>

            {lines.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                <Phone className="w-10 h-10 opacity-30" />
                <p className="text-sm font-medium">Sin líneas asignadas</p>
                <p className="text-xs opacity-60 text-center max-w-xs">
                  Asigná este agente a una línea existente desde el panel{' '}
                  <span className="font-mono">Líneas telefónicas</span>, o editá una línea ya
                  asignada desde aquí cuando corresponda.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {lines.map((line) => (
                  <div key={line.id} className="flex flex-col gap-2">
                    <PhoneLineCard
                      line={line}
                      onConfigure={(l) => {
                        setEditingLine(l);
                        setLineFormOpen(true);
                      }}
                    />
                    {/* Desasignar la línea de este agente */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-muted-foreground hover:text-destructive self-end"
                      onClick={() => void handleUnassignLine(line.id)}
                    >
                      Desasignar línea
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Departments */}
        <TabsContent value="departments" className="mt-0">
          <DepartmentSelector
            selectedIds={assignedDeptIds}
            saving={saving === 'departmentIds'}
            onToggle={(id) => void toggle('departmentIds', id)}
            onEdit={(dept) => setDeptDialog({ open: true, dept })}
            onNew={() => setDeptDialog({ open: true })}
          />
        </TabsContent>

        {/* Model Config */}
        <TabsContent value="model-config" className="mt-0">
          <ModelConfigForm agent={localAgent} onSave={handleSaveModel} />
        </TabsContent>
      </Tabs>

      {/* ── Shared line create/edit dialog ── */}
      <LineForm
        open={lineFormOpen}
        line={editingLine}
        availableAgents={[localAgent]}
        preselectedAgentId={editingLine ? undefined : localAgent.id}
        onClose={() => {
          setLineFormOpen(false);
          setEditingLine(undefined);
        }}
        onCreate={handleCreateLine}
        onUpdate={handleUpdateLine}
      />

      {/* ── Tool create/edit dialog ── */}
      <ToolForm
        open={toolDialog.open}
        tool={toolDialog.open ? toolDialog.tool : undefined}
        onClose={() => setToolDialog({ open: false })}
        onSubmit={handleToolSubmit}
      />

      {/* ── Topic create/edit dialog ── */}
      <TopicForm
        open={topicDialog.open}
        topic={topicDialog.open ? topicDialog.topic : undefined}
        availableTools={tools}
        availablePrompts={prompts}
        onClose={() => setTopicDialog({ open: false })}
        onSubmit={handleTopicSubmit}
      />

      {/* ── Prompt create/edit dialog ── */}
      <PromptEditor
        open={promptDialog.open}
        prompt={promptDialog.open ? promptDialog.prompt : undefined}
        availableTopics={topics}
        onClose={() => setPromptDialog({ open: false })}
        onSubmit={handlePromptSubmit}
      />

      {/* ── Department create/edit dialog ── */}
      <DepartmentForm
        open={deptDialog.open}
        onOpenChange={(v) => !v && setDeptDialog({ open: false })}
        department={deptDialog.open ? deptDialog.dept : undefined}
        onSubmit={handleDeptSubmit}
      />
    </>
  );
}
