-- Translate previously saved default names; retain custom names and colors.
UPDATE "TrackerColumn" AS column_name
SET "label" = translation.english, "updatedAt" = CURRENT_TIMESTAMP
FROM (VALUES
    ('service', 'Trabajo', 'Work'),
    ('workers', 'Responsable', 'Owner'),
    ('status', 'Estado', 'Status'),
    ('dueDate', 'Vencimiento', 'Due date'),
    ('description', 'Notas', 'Notes'),
    ('priority', 'Prioridad', 'Priority'),
    ('paymentStatus', 'Pago', 'Payment'),
    ('laborCost', 'Mano de obra', 'Labor'),
    ('materialCost', 'Material', 'Materials'),
    ('before', 'Antes', 'Before files'),
    ('after', 'Después', 'After files'),
    ('timeline', 'Cronograma', 'Timeline'),
    ('updatedAt', 'Actualizado', 'Last updated'),
    ('actions', 'Acciones', 'Actions')
) AS translation(key, spanish, english)
WHERE column_name."key" = translation.key AND column_name."label" = translation.spanish;

UPDATE "TrackerLabel" AS status_label
SET "label" = translation.english, "updatedAt" = CURRENT_TIMESTAMP
FROM (VALUES
    ('status', 'DONE', 'Completado', 'Done'),
    ('status', 'IN_PROGRESS', 'En proceso', 'Working on it'),
    ('status', 'STUCK', 'Bloqueado', 'Stuck'),
    ('status', 'PENDING', 'Sin iniciar', 'Not started'),
    ('status', 'PLANNING', 'Planificación', 'Planning'),
    ('priority', 'HIGH', 'Alta', 'High'),
    ('priority', 'MEDIUM', 'Media', 'Medium'),
    ('priority', 'LOW', 'Baja', 'Low'),
    ('priority', 'NONE', 'Sin prioridad', 'No priority')
) AS translation(kind, value, spanish, english)
WHERE status_label."kind" = translation.kind AND status_label."value" = translation.value
  AND status_label."label" = translation.spanish;
