-- تشخيص المراحل (شغّله لمعرفة قيم id الصحيحة)
SELECT id, school_id, name_ar, section, stage_type, is_active
FROM public.stages
ORDER BY sort_order NULLS LAST, id;

-- عدد الطلاب لكل مرحلة
SELECT stage_id, count(*) 
FROM public.students 
GROUP BY stage_id;
