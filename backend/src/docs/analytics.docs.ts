/**
 * Documentación OpenAPI de los endpoints de Analytics.
 * Base: /api/v1/analytics
 * Acceso: JWT requerido
 */

/**
 * @openapi
 * tags:
 *   - name: Analytics
 *     description: >
 *       Métricas de la plataforma: tickets, agentes, departamentos y flujo bot/humano.
 *       Todos los endpoints requieren autenticación JWT.
 *       Todos soportan filtros opcionales: from, to, department, agentId.
 *       Respuestas cacheadas in-process (TTL 300s).
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     AnalyticsFilters:
 *       type: object
 *       properties:
 *         from:
 *           type: string
 *           format: date-time
 *           description: Fecha de inicio del rango (ISO 8601)
 *           example: "2024-01-01T00:00:00.000Z"
 *         to:
 *           type: string
 *           format: date-time
 *           description: Fecha de fin del rango (ISO 8601)
 *           example: "2024-01-31T23:59:59.000Z"
 *         department:
 *           type: string
 *           description: Slug del departamento a filtrar
 *           example: obras
 *         agentId:
 *           type: string
 *           format: uuid
 *           description: ID del agente a filtrar
 *           example: 550e8400-e29b-41d4-a716-446655440000
 *
 *     TicketKPIs:
 *       type: object
 *       required: [openTickets, inProgressTickets, resolvedTickets, closedTickets, slaBreachedTickets]
 *       properties:
 *         openTickets:
 *           type: integer
 *           example: 15
 *         inProgressTickets:
 *           type: integer
 *           example: 8
 *         resolvedTickets:
 *           type: integer
 *           example: 42
 *         closedTickets:
 *           type: integer
 *           example: 130
 *         slaBreachedTickets:
 *           type: integer
 *           description: Tickets donde el agente respondió después de 10 minutos
 *           example: 5
 *
 *     TicketTimings:
 *       type: object
 *       required: [avgFirstResponseTime, avgResolutionTime, avgHandleTime]
 *       properties:
 *         avgFirstResponseTime:
 *           type: number
 *           format: float
 *           description: Tiempo promedio hasta primer respuesta del agente (minutos)
 *           example: 6.4
 *         avgResolutionTime:
 *           type: number
 *           format: float
 *           description: Tiempo promedio desde apertura hasta cierre (minutos)
 *           example: 142.5
 *         avgHandleTime:
 *           type: number
 *           format: float
 *           description: Tiempo promedio de manejo total (minutos)
 *           example: 142.5
 *
 *     DailyVolume:
 *       type: object
 *       required: [date, opened, closed]
 *       properties:
 *         date:
 *           type: string
 *           description: Fecha en formato YYYY-MM-DD
 *           example: "2024-01-15"
 *         opened:
 *           type: integer
 *           example: 12
 *         closed:
 *           type: integer
 *           example: 9
 *
 *     SlaMetrics:
 *       type: object
 *       required: [met, breached, complianceRate]
 *       properties:
 *         met:
 *           type: integer
 *           description: Tickets con primera respuesta dentro de 10 minutos
 *           example: 95
 *         breached:
 *           type: integer
 *           description: Tickets con primera respuesta fuera de 10 minutos
 *           example: 5
 *         complianceRate:
 *           type: number
 *           format: float
 *           description: Tasa de cumplimiento SLA (0–1)
 *           example: 0.95
 *
 *     FlowMetrics:
 *       type: object
 *       required: [botFlow, humanFlow, escalated]
 *       properties:
 *         botFlow:
 *           type: integer
 *           description: Conversaciones en estado BOT_FLOW
 *           example: 340
 *         humanFlow:
 *           type: integer
 *           description: Conversaciones en estado HUMAN_FLOW
 *           example: 45
 *         escalated:
 *           type: integer
 *           description: Conversaciones en estado ESCALATED
 *           example: 12
 *
 *     AgentPerformance:
 *       type: object
 *       required: [agentId, name, ticketsHandled, avgResponseTime, avgResolutionTime, slaCompliance]
 *       properties:
 *         agentId:
 *           type: string
 *           format: uuid
 *           example: 550e8400-e29b-41d4-a716-446655440000
 *         name:
 *           type: string
 *           example: Ana García
 *         ticketsHandled:
 *           type: integer
 *           example: 38
 *         avgResponseTime:
 *           type: number
 *           format: float
 *           description: Tiempo promedio de primera respuesta (minutos)
 *           example: 4.2
 *         avgResolutionTime:
 *           type: number
 *           format: float
 *           description: Tiempo promedio de resolución (minutos)
 *           example: 120.5
 *         slaCompliance:
 *           type: number
 *           format: float
 *           description: Tasa de cumplimiento SLA del agente (0–1)
 *           example: 0.97
 *
 *     DepartmentDistribution:
 *       type: object
 *       required: [department, count]
 *       properties:
 *         department:
 *           type: string
 *           example: obras
 *         count:
 *           type: integer
 *           example: 47
 *
 *     DashboardMetrics:
 *       type: object
 *       required: [kpis, timings, dailyVolume, sla, flow]
 *       properties:
 *         kpis:
 *           $ref: '#/components/schemas/TicketKPIs'
 *         timings:
 *           $ref: '#/components/schemas/TicketTimings'
 *         dailyVolume:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/DailyVolume'
 *         sla:
 *           $ref: '#/components/schemas/SlaMetrics'
 *         flow:
 *           $ref: '#/components/schemas/FlowMetrics'
 *
 *     TicketMetricsResponse:
 *       type: object
 *       required: [kpis, timings, dailyVolume, sla]
 *       properties:
 *         kpis:
 *           $ref: '#/components/schemas/TicketKPIs'
 *         timings:
 *           $ref: '#/components/schemas/TicketTimings'
 *         dailyVolume:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/DailyVolume'
 *         sla:
 *           $ref: '#/components/schemas/SlaMetrics'
 *
 *     AgentMetricsResponse:
 *       type: object
 *       required: [agents]
 *       properties:
 *         agents:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/AgentPerformance'
 *
 *     DepartmentMetricsResponse:
 *       type: object
 *       required: [departments]
 *       properties:
 *         departments:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/DepartmentDistribution'
 */

/**
 * @openapi
 * /api/v1/analytics/dashboard:
 *   get:
 *     tags: [Analytics]
 *     summary: Dashboard de métricas completas
 *     description: >
 *       Retorna KPIs de tickets, tiempos promedio, volumen diario, métricas SLA
 *       y distribución de flujo bot/humano/escalado.
 *       Respuesta cacheada in-process (TTL 300s).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Fecha de inicio del rango
 *         example: "2024-01-01T00:00:00.000Z"
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Fecha de fin del rango
 *         example: "2024-01-31T23:59:59.000Z"
 *       - in: query
 *         name: department
 *         schema:
 *           type: string
 *         description: Slug del departamento
 *         example: obras
 *       - in: query
 *         name: agentId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID del agente
 *     responses:
 *       200:
 *         description: Métricas del dashboard
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DashboardMetrics'
 *       400:
 *         description: Parámetros de filtro inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationErrorResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */

/**
 * @openapi
 * /api/v1/analytics/tickets:
 *   get:
 *     tags: [Analytics]
 *     summary: Métricas de tickets
 *     description: >
 *       Retorna KPIs de tickets (open/in-progress/resolved/closed/slaBreached),
 *       tiempos promedio, volumen diario y cumplimiento SLA.
 *       Respuesta cacheada in-process (TTL 300s).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: department
 *         schema:
 *           type: string
 *       - in: query
 *         name: agentId
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Métricas de tickets
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TicketMetricsResponse'
 *       400:
 *         description: Parámetros inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationErrorResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */

/**
 * @openapi
 * /api/v1/analytics/agents:
 *   get:
 *     tags: [Analytics]
 *     summary: Performance de agentes
 *     description: >
 *       Retorna métricas por agente: tickets manejados, tiempo promedio de
 *       primera respuesta, tiempo de resolución y cumplimiento SLA.
 *       Respuesta cacheada in-process (TTL 300s).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: department
 *         schema:
 *           type: string
 *       - in: query
 *         name: agentId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filtrar por un agente específico
 *     responses:
 *       200:
 *         description: Lista de métricas por agente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AgentMetricsResponse'
 *       400:
 *         description: Parámetros inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationErrorResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */

/**
 * @openapi
 * /api/v1/analytics/departments:
 *   get:
 *     tags: [Analytics]
 *     summary: Distribución de tickets por departamento
 *     description: >
 *       Retorna el conteo de tickets agrupados por departamento, ordenados
 *       de mayor a menor volumen.
 *       Respuesta cacheada in-process (TTL 300s).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: department
 *         schema:
 *           type: string
 *         description: Filtrar por un departamento específico
 *       - in: query
 *         name: agentId
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Distribución por departamento
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DepartmentMetricsResponse'
 *       400:
 *         description: Parámetros inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationErrorResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */

export {};
