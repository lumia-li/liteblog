<script lang="ts">
	import { onMount } from "svelte";
	import { readStoredDevCredential } from "@utils/dev-auth-client";
	import * as XLSX from "xlsx";

	type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
	type DisplayDayKey = "mon" | "tue" | "wed" | "thu" | "fri";

	type CourseItem = {
		course: string;
		weeks: string;
		location: string;
		teacher: string;
		color: string;
	};

	type PeriodItem = {
		id: string;
		label: string;
		time: string;
	};

	type TimetableState = {
		termName: string;
		totalWeeks: number;
		currentWeek: number;
		termStartDate: string;
		periods: PeriodItem[];
		courses: Record<string, CourseItem[]>;
		weeklySheets?: Record<string, { periods: PeriodItem[]; courses: Record<string, CourseItem[]> }>;
		weeklyMode?: boolean;
	};

	const TIMETABLE_API_URL = "/api/timetable";
	const DAY_ORDER: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
	const DISPLAY_DAYS: DisplayDayKey[] = ["mon", "tue", "wed", "thu", "fri"];
	const DAY_LABELS: Record<DayKey, string> = {
		mon: "周一",
		tue: "周二",
		wed: "周三",
		thu: "周四",
		fri: "周五",
		sat: "周六",
		sun: "周日",
	};
	const CARD_COLORS = ["#68dfcd", "#8f9eff", "#ddb8ea", "#e9da77", "#95dc5d", "#82cbff", "#9ddfcd"];
	const IMPORT_PERIOD_GROUPS: Array<{ label: string; slots: number[]; time: string }> = [
		{ label: "1-2", slots: [1, 2], time: "08:30 - 10:00" },
		{ label: "3-4", slots: [3, 4], time: "10:20 - 11:50" },
		{ label: "5-6", slots: [5, 6], time: "13:00 - 14:25" },
		{ label: "6-8", slots: [6, 7, 8], time: "14:45 - 16:10" },
		{ label: "9-10", slots: [9, 10], time: "18:30 - 20:00" },
	];

	const DEFAULT_PERIODS: PeriodItem[] = IMPORT_PERIOD_GROUPS.map((item, index) => ({
		id: `p${index + 1}`,
		label: item.label,
		time: item.time,
	}));

	let termName = "大一下2";
	let totalWeeks = 18;
	let currentWeek = 9;
	let termStartDate = "";
	let periods: PeriodItem[] = [...DEFAULT_PERIODS];
	let courses: Record<string, CourseItem[]> = {};
	let weeklySheets: Record<string, { periods: PeriodItem[]; courses: Record<string, CourseItem[]> }> = {};
	let weeklyMode = false;
	let fileInput: HTMLInputElement | null = null;
	let importMessage = "";
	let importError = "";
	let toolsOpen = false;
	let hasLoadedState = false;
	let canEdit = false;
	let isSaving = false;
	let detectedCurrentWeek: number | null = null;
	let isViewingDetectedWeek = false;

	let modalOpen = false;
	let editingKey = "";
	let editingPeriodId = "";
	let editingDay: DayKey = "mon";
	let editingForm: CourseItem = {
		course: "",
		weeks: "",
		location: "",
		teacher: "",
		color: CARD_COLORS[0],
	};

	const courseKey = (periodId: string, day: DayKey) => `${periodId}__${day}`;

	function clonePeriods(input: PeriodItem[]): PeriodItem[] {
		return input.map((item) => ({ id: item.id, label: item.label, time: item.time }));
	}

	function normalizePeriods(input: unknown): PeriodItem[] {
		if (!Array.isArray(input) || input.length === 0) return [];
		return input.map((item, idx) => {
			const raw = (item || {}) as Partial<PeriodItem>;
			return {
				id: raw.id || `p${idx + 1}`,
				label: raw.label || `第 ${idx * 2 + 1}-${idx * 2 + 2} 节`,
				time: raw.time || "",
			};
		});
	}

	function normalizeCourses(input: unknown): Record<string, CourseItem[]> {
		if (!input || typeof input !== "object") return {};
		const normalized: Record<string, CourseItem[]> = {};
		for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
			if (Array.isArray(value)) {
				normalized[key] = value
					.filter(Boolean)
					.map((item) => {
						const rawItem = (item || {}) as Partial<CourseItem>;
						return {
							course: typeof rawItem.course === "string" ? rawItem.course : "",
							weeks: typeof rawItem.weeks === "string" ? rawItem.weeks : "",
							location: typeof rawItem.location === "string" ? rawItem.location : "",
							teacher: typeof rawItem.teacher === "string" ? rawItem.teacher : "",
							color:
								typeof rawItem.color === "string" && rawItem.color.trim()
									? rawItem.color
									: CARD_COLORS[0],
						};
					});
				continue;
			}
			if (value && typeof value === "object") {
				const rawItem = value as Partial<CourseItem>;
				normalized[key] = [
					{
						course: typeof rawItem.course === "string" ? rawItem.course : "",
						weeks: typeof rawItem.weeks === "string" ? rawItem.weeks : "",
						location: typeof rawItem.location === "string" ? rawItem.location : "",
						teacher: typeof rawItem.teacher === "string" ? rawItem.teacher : "",
						color:
							typeof rawItem.color === "string" && rawItem.color.trim()
								? rawItem.color
								: CARD_COLORS[0],
					},
				];
			}
		}
		return normalized;
	}

	function cloneCoursesMap(input: Record<string, CourseItem[]>): Record<string, CourseItem[]> {
		const cloned: Record<string, CourseItem[]> = {};
		for (const [key, value] of Object.entries(input)) {
			cloned[key] = value.map((item) => ({ ...item }));
		}
		return cloned;
	}

	function syncViewFromWeekly() {
		if (!weeklyMode) return;
		const active = weeklySheets[String(currentWeek)];
		if (!active) return;
		periods = clonePeriods(active.periods);
		courses = cloneCoursesMap(active.courses);
	}

	function writeCurrentWeekToWeekly() {
		if (!weeklyMode) return;
		const weekKey = String(currentWeek);
		weeklySheets = {
			...weeklySheets,
			[weekKey]: {
				periods: clonePeriods(periods),
				courses: cloneCoursesMap(courses),
			},
		};
	}

	function parsePeriodSlotNumber(label: string): number | null {
		const cleaned = label.replace(/\s+/g, "");
		const match = cleaned.match(/^第?(\d{1,2})(?:[-~](\d{1,2}))?节?$/);
		if (!match?.[1]) return null;
		const n = Number(match[1]);
		return Number.isInteger(n) && n > 0 ? n : null;
	}

	function normalizePeriodGroupLabel(label: string): string {
		const cleaned = label.replace(/\s+/g, "");
		const match = cleaned.match(/(\d{1,2})[-~](\d{1,2})/);
		if (!match?.[1] || !match?.[2]) return cleaned;
		return `${match[1]}-${match[2]}`;
	}

	function normalizeImportedPeriods(
		sourcePeriods: PeriodItem[],
		sourceCourses: Record<string, CourseItem[]>,
	): { periods: PeriodItem[]; courses: Record<string, CourseItem[]> } {
		const targetLabels = IMPORT_PERIOD_GROUPS.map((item) => item.label);
		const currentLabels = sourcePeriods.map((item) => normalizePeriodGroupLabel(item.label));
		const alreadyGrouped =
			sourcePeriods.length === targetLabels.length &&
			currentLabels.every((label, idx) => label === targetLabels[idx]);
		if (alreadyGrouped) {
			const normalizedPeriods = sourcePeriods.map((item, idx) => ({
				...item,
				label: IMPORT_PERIOD_GROUPS[idx].label,
				time: IMPORT_PERIOD_GROUPS[idx].time,
			}));
			return { periods: normalizedPeriods, courses: sourceCourses };
		}

		const slotToPeriodIds = new Map<number, string[]>();
		for (let periodIndex = 0; periodIndex < sourcePeriods.length; periodIndex += 1) {
			const period = sourcePeriods[periodIndex];
			let slot = parsePeriodSlotNumber(period.label);
			// Fallback: when labels are non-standard after Excel parsing,
			// group by row order (1..N) so imported sheets still fold to target sections.
			if (slot === null) slot = periodIndex + 1;
			const exists = slotToPeriodIds.get(slot) || [];
			exists.push(period.id);
			slotToPeriodIds.set(slot, exists);
		}
		if (!slotToPeriodIds.size) return { periods: sourcePeriods, courses: sourceCourses };

		const nextPeriods: PeriodItem[] = [];
		const nextCourses: Record<string, CourseItem[]> = {};

		for (let i = 0; i < IMPORT_PERIOD_GROUPS.length; i += 1) {
			const group = IMPORT_PERIOD_GROUPS[i];
			const groupPeriodIds = group.slots.flatMap((slot) => slotToPeriodIds.get(slot) || []);
			if (!groupPeriodIds.length) continue;

			const newPeriodId = `p_group_${i + 1}`;
			nextPeriods.push({
				id: newPeriodId,
				label: group.label,
				time: group.time,
			});

			for (const day of DAY_ORDER) {
				const collected: CourseItem[] = [];
				for (const sourcePeriodId of groupPeriodIds) {
					const key = courseKey(sourcePeriodId, day);
					const items = sourceCourses[key];
					if (!items?.length) continue;
					collected.push(...items.map((item) => ({ ...item })));
				}
				if (!collected.length) continue;
				nextCourses[courseKey(newPeriodId, day)] = dedupeCourseItems(collected);
			}
		}

		if (!nextPeriods.length) return { periods: sourcePeriods, courses: sourceCourses };
		return { periods: nextPeriods, courses: nextCourses };
	}

	function isNumericSequentialPeriods(input: PeriodItem[]): boolean {
		if (input.length < 7) return false;
		for (let i = 0; i < input.length; i += 1) {
			const slot = parsePeriodSlotNumber(input[i]?.label || "");
			if (slot !== i + 1) return false;
		}
		return true;
	}

	function forceGroupCurrentStateIfNeeded() {
		const shouldGroupByLen = periods.length >= 7;
		const shouldGroupByLabel = isNumericSequentialPeriods(periods);
		if (!shouldGroupByLen && !shouldGroupByLabel) return;
		const migrated = normalizeImportedPeriods(periods, courses);
		if (migrated.periods.length === periods.length) {
			const samePeriods = migrated.periods.every(
				(item, idx) =>
					item.id === periods[idx]?.id &&
					item.label === periods[idx]?.label &&
					item.time === periods[idx]?.time,
			);
			if (samePeriods) return;
		}
		periods = migrated.periods;
		courses = migrated.courses;
		writeCurrentWeekToWeekly();
	}

	const buildState = (): TimetableState => ({
		termName,
		totalWeeks,
		currentWeek,
		termStartDate,
		periods,
		courses,
		weeklySheets: weeklyMode ? weeklySheets : {},
		weeklyMode,
	});

	function applyParsedState(parsed: Partial<TimetableState>) {
		if (typeof parsed.termName === "string" && parsed.termName.trim()) termName = parsed.termName;
		if (typeof parsed.totalWeeks === "number" && parsed.totalWeeks > 0) totalWeeks = parsed.totalWeeks;
		if (typeof parsed.currentWeek === "number" && parsed.currentWeek > 0) currentWeek = parsed.currentWeek;
		if (typeof parsed.termStartDate === "string") termStartDate = parsed.termStartDate;
		const parsedWeeklySheets: Record<string, { periods: PeriodItem[]; courses: Record<string, CourseItem[]> }> = {};
		const rawWeeklySheets = (parsed as { weeklySheets?: unknown }).weeklySheets;
		if (rawWeeklySheets && typeof rawWeeklySheets === "object") {
			for (const [weekKey, value] of Object.entries(rawWeeklySheets as Record<string, unknown>)) {
				if (!value || typeof value !== "object") continue;
				const raw = value as { periods?: unknown; courses?: unknown };
				const weekPeriods = normalizePeriods(raw.periods);
				const weekCourses = normalizeCourses(raw.courses);
				if (!weekPeriods.length) continue;
				const migrated = normalizeImportedPeriods(weekPeriods, weekCourses);
				parsedWeeklySheets[weekKey] = {
					periods: migrated.periods,
					courses: migrated.courses,
				};
			}
		}
		weeklySheets = parsedWeeklySheets;
		weeklyMode =
			(parsed as { weeklyMode?: boolean }).weeklyMode === true &&
			Object.keys(parsedWeeklySheets).length > 0;
		if (weeklyMode) {
			const knownWeeks = Object.keys(parsedWeeklySheets).map((key) => Number(key)).filter((n) => Number.isFinite(n) && n > 0);
			if (knownWeeks.length) {
				totalWeeks = Math.max(totalWeeks, ...knownWeeks);
			}
			const active = parsedWeeklySheets[String(currentWeek)];
			if (active) {
				periods = clonePeriods(active.periods);
				courses = cloneCoursesMap(active.courses);
				return;
			}
		}
		const parsedPeriods = normalizePeriods(parsed.periods);
		const parsedCourses = normalizeCourses(parsed.courses);
		if (parsedPeriods.length) {
			const migrated = normalizeImportedPeriods(parsedPeriods, parsedCourses);
			periods = migrated.periods;
			courses = migrated.courses;
		} else if (Object.keys(parsedCourses).length > 0) {
			courses = parsedCourses;
		}
	}

	type TimetableApiGetResponse = {
		ok?: boolean;
		state?: Partial<TimetableState> | null;
		message?: string;
	};

	function hasDevCredential(): boolean {
		return Boolean(readStoredDevCredential());
	}

	async function loadState() {
		if (typeof window === "undefined") return;
		try {
			const response = await fetch(TIMETABLE_API_URL, {
				method: "GET",
				cache: "no-store",
			});
			const result = (await response.json().catch(() => ({}))) as TimetableApiGetResponse;
			if (!response.ok) {
				throw new Error(
					typeof result.message === "string" && result.message.trim()
						? result.message
						: "读取共享课程表失败",
				);
			}
			if (result.state && typeof result.state === "object") {
				applyParsedState(result.state);
				importMessage = "";
				importError = "";
				return;
			}
			importMessage = "共享课程表暂未设置";
			importError = "";
		} catch (error) {
			importError = error instanceof Error ? error.message : "读取共享课程表失败";
		}
	}

	onMount(() => {
		const syncPermission = () => {
			canEdit = hasDevCredential();
		};
		syncPermission();
		window.addEventListener("focus", syncPermission);
		void (async () => {
			await loadState();
			if (currentWeek > totalWeeks) currentWeek = totalWeeks;
			hasLoadedState = true;
		})();
		return () => {
			window.removeEventListener("focus", syncPermission);
		};
	});

	$: if (totalWeeks < 1) totalWeeks = 1;
	$: if (currentWeek < 1) currentWeek = 1;
	$: if (currentWeek > totalWeeks) currentWeek = totalWeeks;
	$: detectedCurrentWeek = detectCurrentWeekByDate();
	$: isViewingDetectedWeek = detectedCurrentWeek !== null && currentWeek === detectedCurrentWeek;
	$: if (weeklyMode && hasLoadedState) {
		currentWeek;
		weeklySheets;
		syncViewFromWeekly();
	}
	$: if (hasLoadedState) {
		periods;
		courses;
		forceGroupCurrentStateIfNeeded();
	}

	function prevWeek() {
		currentWeek = Math.max(1, currentWeek - 1);
		syncViewFromWeekly();
	}

	function nextWeek() {
		currentWeek = Math.min(totalWeeks, currentWeek + 1);
		syncViewFromWeekly();
	}

	function setCurrentWeekTag() {
		const detected = detectCurrentWeekByDate();
		if (detected === null) {
			importError = "请先设置开学日期，再使用“当前周”自动判定";
			importMessage = "";
			return;
		}
		currentWeek = detected;
		importError = "";
		importMessage = `已按日期自动定位到第 ${currentWeek} 周`;
		syncViewFromWeekly();
	}

	function addPeriod() {
		const next = periods.length + 1;
		periods = [...periods, { id: `p${Date.now()}_${next}`, label: `第 ${next * 2 - 1}-${next * 2} 节`, time: "" }];
		writeCurrentWeekToWeekly();
	}

	function removePeriod(periodId: string) {
		periods = periods.filter((item) => item.id !== periodId);
		const nextCourses: Record<string, CourseItem[]> = {};
		for (const [key, value] of Object.entries(courses)) {
			if (!key.startsWith(`${periodId}__`)) nextCourses[key] = value;
		}
		courses = nextCourses;
		writeCurrentWeekToWeekly();
	}

	function openEditor(periodId: string, day: DayKey) {
		if (!canEdit) {
			importError = "当前为只读模式，请先在开发者编辑器完成口令验证后再编辑";
			importMessage = "";
			return;
		}
		editingPeriodId = periodId;
		editingDay = day;
		editingKey = courseKey(periodId, day);
		const current = courses[editingKey];
		const activeEntry =
			(weeklyMode ? current?.[0] : current?.find((item) => parseWeekInRange(item.weeks, currentWeek))) ||
			current?.[0] ||
			null;
		editingForm = activeEntry
			? {
					...activeEntry,
					color:
						typeof activeEntry.color === "string" && activeEntry.color.trim()
							? activeEntry.color
							: CARD_COLORS[0],
				}
			: {
					course: "",
					weeks: "",
					location: "",
					teacher: "",
					color: CARD_COLORS[Math.floor(Math.random() * CARD_COLORS.length)] || CARD_COLORS[0],
				};
		modalOpen = true;
	}

	function saveEditor() {
		if (!editingForm.course.trim()) {
			const { [editingKey]: _, ...rest } = courses;
			courses = rest;
			writeCurrentWeekToWeekly();
			modalOpen = false;
			return;
		}
		courses = {
			...courses,
			[editingKey]: [
				{
					...editingForm,
					course: editingForm.course.trim(),
					weeks: editingForm.weeks.trim(),
					location: editingForm.location.trim(),
					teacher: editingForm.teacher.trim(),
				},
				],
		};
		writeCurrentWeekToWeekly();
		modalOpen = false;
	}

	function deleteCurrentCourse() {
		const { [editingKey]: _, ...rest } = courses;
		courses = rest;
		writeCurrentWeekToWeekly();
		modalOpen = false;
	}

	function resetAll() {
		termName = "大一下2";
		totalWeeks = 18;
		currentWeek = 1;
		termStartDate = "";
		periods = [...DEFAULT_PERIODS];
		courses = {};
		weeklySheets = {};
		weeklyMode = false;
		importMessage = "已重置";
		importError = "";
	}

	function normalizeDayKey(value: string): DayKey | null {
		const raw = value.replace(/\s/g, "");
		if (!raw) return null;
		if (/^(周一|星期一|礼拜一|1)$/i.test(raw)) return "mon";
		if (/^(周二|星期二|礼拜二|2)$/i.test(raw)) return "tue";
		if (/^(周三|星期三|礼拜三|3)$/i.test(raw)) return "wed";
		if (/^(周四|星期四|礼拜四|4)$/i.test(raw)) return "thu";
		if (/^(周五|星期五|礼拜五|5)$/i.test(raw)) return "fri";
		if (/^(周六|星期六|礼拜六|6)$/i.test(raw)) return "sat";
		if (/^(周日|周天|星期日|星期天|礼拜日|礼拜天|7)$/i.test(raw)) return "sun";
		return null;
	}

	function parseCourseText(cellValue: string): CourseItem[] {
		const cleaned = cellValue.replace(/\r/g, "").trim();
		if (!cleaned || cleaned === "-" || cleaned === "—") return [];

		const lines = cleaned
			.split(/\n|；|;/)
			.map((item) => item.trim())
			.filter(Boolean);
		if (!lines.length) return [];

		const weekExpr =
			/(?:\d{1,2}(?:\s*[-~]\s*\d{1,2})?(?:\s*[，,]\s*\d{1,2}(?:\s*[-~]\s*\d{1,2})?)*)\s*周(?:\([单双]\))?/g;
		const isWeekOnlyLine = (line: string): boolean => {
			const compact = line.replace(/\s+/g, "");
			return /^(?:第)?\d{1,2}(?:[-~]\d{1,2})?(?:[，,]\d{1,2}(?:[-~]\d{1,2})?)*周(?:\([单双]\))?$/.test(compact);
		};
		const normalizeCourseName = (line: string): string => {
			const text = line
				.replace(weekExpr, "")
				.replace(/(?:周|星期|礼拜)[一二三四五六日天](?:第?\d{1,2}(?:[-~]\d{1,2})?节)?/g, "")
				.replace(/\d{1,2}(?:[-~]\d{1,2})?节/g, "")
				.replace(/[()（）【】\[\]]/g, " ")
				.replace(/\s+/g, " ")
				.trim();
			return text || line.trim();
		};
		const isLikelyTeacherLine = (line: string): boolean => {
			const compact = line.replace(/\s+/g, "");
			if (!compact) return false;
			if (/^(教师|老师|任课教师|授课教师)/.test(compact)) return true;
			return /^[\u4e00-\u9fa5]{2,4}$/.test(compact);
		};
		const isLikelyLocationLine = (line: string): boolean => {
			const compact = line.replace(/\s+/g, "");
			if (!compact) return false;
			if (/^(教室|地点|上课地点|教室地点|房间)/.test(compact)) return true;
			return /楼|室|馆|场|区|实验室|教室|运动场|\(|（|\d{3,4}|J\d{3}|SG\d{3}/.test(compact);
		};
		if (lines.length >= 2 && !/[;；]/.test(cleaned)) {
			const first = lines[0] || "";
			const second = lines[1] || "";
			const third = lines[2] || "";
			if (
				first &&
				!isWeekOnlyLine(first) &&
				isLikelyLocationLine(second) &&
				(!third || isLikelyTeacherLine(third))
			) {
				return [
					{
						course: normalizeCourseName(first),
						weeks: "",
						location: second.trim(),
						teacher: third.trim(),
						color: CARD_COLORS[Math.floor(Math.random() * CARD_COLORS.length)] || CARD_COLORS[0],
					},
				];
			}
		}

		const isCourseTitleLine = (line: string): boolean => {
			if (!line) return false;
			const compact = line.replace(/\s+/g, "");
			if (isWeekOnlyLine(line)) return false;
			if (/^(?:周|星期|礼拜)[一二三四五六日天](?:第?\d{1,2}(?:[-~]\d{1,2})?节)?$/.test(compact)) {
				return false;
			}
			if (/^\d{1,2}(?:[-~]\d{1,2})?节$/.test(compact)) return false;
			if (/^(教室|地点|上课地点|教室地点|房间|教师|老师|任课教师|授课教师)/.test(line)) return false;
			return true;
		};

		const starts: number[] = [];
		for (let i = 0; i < lines.length; i += 1) {
			if (isCourseTitleLine(lines[i])) starts.push(i);
		}
		const blockStarts = starts.length ? starts : [0];

		const parseBlock = (blockLines: string[]): CourseItem | null => {
			const joined = blockLines.join("\n");
			let course = blockLines.find((line) => isCourseTitleLine(line)) || blockLines[0] || "";
			let weeks = "";
			let location = "";
			let teacher = "";

			const weekTokens = Array.from(joined.matchAll(weekExpr))
				.map((match) => (match[0] || "").replace(/\s+/g, ""))
				.filter(Boolean);
			if (weekTokens.length) {
				weeks = Array.from(new Set(weekTokens)).join(",");
			}

			for (const line of blockLines) {
				if (/^(教室|地点|上课地点|教室地点|房间)\s*[:：]/.test(line)) {
					location = line.replace(/^(教室|地点|上课地点|教室地点|房间)\s*[:：]\s*/, "").trim();
					continue;
				}
				if (/^(教师|老师|任课教师|授课教师)\s*[:：]/.test(line)) {
					teacher = line.replace(/^(教师|老师|任课教师|授课教师)\s*[:：]\s*/, "").trim();
					continue;
				}
			}

			if (!location) {
				const loc = joined.match(/(?:教室|地点|上课地点|房间)\s*[:：]\s*([^\n,，;；]+)/);
				if (loc?.[1]) location = loc[1].trim();
			}
			if (!teacher) {
				const tch = joined.match(/(?:教师|老师|任课教师|授课教师)\s*[:：]\s*([^\n,，;；]+)/);
				if (tch?.[1]) teacher = tch[1].trim();
			}
			const plainLines = blockLines.map((line) => line.trim()).filter(Boolean);
			if (!location && plainLines.length >= 2 && !/[:：]/.test(plainLines[1])) {
				location = plainLines[1];
			}
			if (!teacher && plainLines.length >= 3 && !/[:：]/.test(plainLines[2])) {
				teacher = plainLines[2];
			}
			const pipeParts = joined
				.split(/\s*[|｜]\s*/)
				.map((item) => item.trim())
				.filter(Boolean);
			if (pipeParts.length >= 2) {
				course = pipeParts[0] || course;
				if (!location) location = pipeParts[1] || "";
				if (!teacher && pipeParts.length >= 3) teacher = pipeParts[2] || "";
			}
			course = normalizeCourseName(course);
			if (!course) course = joined.split(/\s+/)[0] || "";
			if (!course) return null;

			return {
				course,
				weeks,
				location,
				teacher,
				color: CARD_COLORS[Math.floor(Math.random() * CARD_COLORS.length)] || CARD_COLORS[0],
			};
		};

		const entries: CourseItem[] = [];
		for (let i = 0; i < blockStarts.length; i += 1) {
			const start = blockStarts[i];
			const end = i + 1 < blockStarts.length ? blockStarts[i + 1] : lines.length;
			const block = lines.slice(start, end).filter(Boolean);
			if (!block.length) continue;
			const parsed = parseBlock(block);
			if (parsed) entries.push(parsed);
		}

		if (!entries.length) {
			const fallback = parseBlock(lines);
			if (fallback) entries.push(fallback);
		}
		return entries;
	}

	function findHeaderRow(rows: string[][]): { rowIndex: number; dayColumns: Map<DayKey, number>; periodCol: number } | null {
		for (let i = 0; i < Math.min(rows.length, 20); i += 1) {
			const row = rows[i] || [];
			const dayColumns = new Map<DayKey, number>();
			for (let col = 0; col < row.length; col += 1) {
				const day = normalizeDayKey((row[col] || "").toString());
				if (day && !dayColumns.has(day)) dayColumns.set(day, col);
			}
			if (dayColumns.size >= 3) {
				const minDayCol = Math.min(...Array.from(dayColumns.values()));
				let periodCol = 0;
				for (let c = 0; c < minDayCol; c += 1) {
					const text = (row[c] || "").toString().trim();
					if (/节次|课时|时间|节/.test(text)) {
						periodCol = c;
						break;
					}
				}
				return { rowIndex: i, dayColumns, periodCol };
			}
		}
		return null;
	}

	type ParsedSheetTimetable = {
		sheetName: string;
		title: string;
		weekNo: number | null;
		periods: PeriodItem[];
		courses: Record<string, CourseItem[]>;
	};

	function extractSheetWeekNo(sheetName: string, title: string): number | null {
		const source = `${sheetName} ${title}`;
		const match = source.match(/第\s*(\d{1,2})\s*周/);
		if (!match?.[1]) return null;
		const weekNo = Number(match[1]);
		if (!Number.isInteger(weekNo) || weekNo < 1) return null;
		return weekNo;
	}

	function extractTermName(sheetName: string, title: string): string {
		const raw = (title || sheetName || "").trim();
		if (!raw) return "";
		return raw.replace(/第\s*\d{1,2}\s*周课程表/g, "").replace(/课程表$/g, "").trim();
	}

	function dedupeCourseItems(items: CourseItem[]): CourseItem[] {
		const map = new Map<string, CourseItem>();
		for (const item of items) {
			const signature = `${item.course}\n${item.weeks}\n${item.location}\n${item.teacher}`;
			if (!map.has(signature)) map.set(signature, item);
		}
		return Array.from(map.values());
	}

	function parseWeekInRange(weeksText: string, week: number): boolean {
		if (!weeksText.trim()) return true;
		const normalized = weeksText.replace(/\s+/g, "");
		const oddOnly = /单/.test(normalized);
		const evenOnly = /双/.test(normalized);

		let matched = false;
		const rangePattern = /(\d{1,2})(?:[-~](\d{1,2}))?/g;
		let match = rangePattern.exec(normalized);
		while (match) {
			const start = Number(match[1]);
			const end = Number(match[2] || match[1]);
			if (week >= start && week <= end) {
				matched = true;
				break;
			}
			match = rangePattern.exec(normalized);
		}

		if (!matched && /周/.test(normalized)) return false;
		if (oddOnly && week % 2 === 0) return false;
		if (evenOnly && week % 2 === 1) return false;
		return matched || !/\d/.test(normalized);
	}

	function isActiveCourse(item: CourseItem): boolean {
		if (weeklyMode) return true;
		return parseWeekInRange(item.weeks, currentWeek);
	}

	function getDisplayCourse(periodId: string, day: DayKey): CourseItem | null {
		const entries = courses[courseKey(periodId, day)];
		if (!entries || !entries.length) return null;
		if (weeklyMode) return entries[0] || null;
		const active = entries.find((item) => isActiveCourse(item));
		if (active) return active;
		const noWeekRule = entries.find((item) => !item.weeks.trim());
		return noWeekRule || null;
	}

	function detectCurrentWeekByDate(): number | null {
		if (!termStartDate) return null;
		const start = new Date(`${termStartDate}T00:00:00`);
		const now = new Date();
		if (Number.isNaN(start.getTime())) return null;
		const dayDiff = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
		const week = Math.floor(dayDiff / 7) + 1;
		return Math.max(1, Math.min(totalWeeks, week));
	}

	async function saveNow() {
		if (typeof window === "undefined") return;
		if (isSaving) return;
		const devCodeHash = readStoredDevCredential();
		if (!devCodeHash) {
			canEdit = false;
			importError = "未检测到开发者凭据，请先在编辑器里验证口令后再保存";
			importMessage = "";
			return;
		}
		isSaving = true;
		try {
			const response = await fetch(TIMETABLE_API_URL, {
				method: "POST",
				cache: "no-store",
				headers: {
					"Content-Type": "application/json; charset=utf-8",
				},
				body: JSON.stringify({
					state: buildState(),
					devCodeHash,
				}),
			});
			const result = (await response.json().catch(() => ({}))) as {
				ok?: boolean;
				message?: string;
			};
			if (!response.ok || result.ok !== true) {
				throw new Error(
					typeof result.message === "string" && result.message.trim()
						? result.message
						: "保存失败",
				);
			}
			importMessage = "已保存到共享课程表";
			importError = "";
			window.dispatchEvent(new CustomEvent("timetable-updated"));
		} catch (error) {
			importError = error instanceof Error ? error.message : "保存失败";
			importMessage = "";
		} finally {
			isSaving = false;
			canEdit = hasDevCredential();
		}
	}

	function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
		const cleaned = hex.replace("#", "").trim();
		if (cleaned.length === 3) {
			const r = Number.parseInt(cleaned[0] + cleaned[0], 16);
			const g = Number.parseInt(cleaned[1] + cleaned[1], 16);
			const b = Number.parseInt(cleaned[2] + cleaned[2], 16);
			if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
			return { r, g, b };
		}
		if (cleaned.length === 6) {
			const r = Number.parseInt(cleaned.slice(0, 2), 16);
			const g = Number.parseInt(cleaned.slice(2, 4), 16);
			const b = Number.parseInt(cleaned.slice(4, 6), 16);
			if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
			return { r, g, b };
		}
		return null;
	}

	function toSoftBg(color: string): string {
		const rgb = hexToRgb(color);
		if (!rgb) return "#eef2f5";
		return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.32)`;
	}

	function toCardRing(color: string): string {
		const rgb = hexToRgb(color);
		if (!rgb) return "rgba(148, 163, 184, 0.35)";
		return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.62)`;
	}

	async function importExcel(event: Event) {
		importError = "";
		importMessage = "";
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		try {
			const buffer = await file.arrayBuffer();
			const workbook = XLSX.read(buffer, { type: "array" });
			if (!workbook.SheetNames.length) {
				importError = "未找到工作表内容";
				return;
			}

			const parsedSheets: ParsedSheetTimetable[] = [];
			for (const sheetName of workbook.SheetNames) {
				const sheet = workbook.Sheets[sheetName];
				const rows = XLSX.utils.sheet_to_json(sheet, {
					header: 1,
					raw: false,
					defval: "",
				}) as string[][];
				const header = findHeaderRow(rows);
				if (!header) continue;

				const nextPeriods: PeriodItem[] = [];
				const nextCourses: Record<string, CourseItem[]> = {};
				let periodIndex = 0;

				for (let r = header.rowIndex + 1; r < rows.length; r += 1) {
					const row = rows[r] || [];
					const periodRaw = (row[header.periodCol] || "").toString().trim();
					const textRow = row.map((v) => (v || "").toString().trim()).join("");
					if (!periodRaw && !textRow) continue;

					const periodId = `p_import_${periodIndex + 1}`;
					const timeCandidate = (row[header.periodCol + 1] || "").toString().trim();
					nextPeriods.push({
						id: periodId,
						label: periodRaw || `第 ${periodIndex * 2 + 1}-${periodIndex * 2 + 2} 节`,
						time: /\d{1,2}:\d{2}/.test(timeCandidate) ? timeCandidate : "",
					});
					periodIndex += 1;

					for (const day of DAY_ORDER) {
						const col = header.dayColumns.get(day);
						if (col === undefined) continue;
						const cellText = (row[col] || "").toString().trim();
						const items = parseCourseText(cellText);
						if (!items.length) continue;
						nextCourses[courseKey(periodId, day)] = items;
					}
				}

				if (nextPeriods.length > 0) {
					const title = (rows[0]?.[0] || "").toString().trim();
					parsedSheets.push({
						sheetName,
						title,
						weekNo: extractSheetWeekNo(sheetName, title),
						periods: nextPeriods,
						courses: nextCourses,
					});
				}
			}

			if (!parsedSheets.length) {
				importError = "未识别到课程表结构，请确认文件包含“周一~周五”等表头";
				return;
			}

			const weeklySheetEntries = parsedSheets
				.filter((item) => item.weekNo !== null)
				.sort((a, b) => (a.weekNo || 0) - (b.weekNo || 0));

			if (weeklySheetEntries.length >= 2) {
				const nextWeeklySheets: Record<string, { periods: PeriodItem[]; courses: Record<string, CourseItem[]> }> = {};
				for (const sheet of weeklySheetEntries) {
					const weekNo = sheet.weekNo || 1;
					const weekKey = String(weekNo);
					nextWeeklySheets[weekKey] = {
						periods: clonePeriods(sheet.periods),
						courses: cloneCoursesMap(sheet.courses),
					};
				}
				const maxWeekNo = weeklySheetEntries.reduce((max, item) => Math.max(max, item.weekNo || 0), 1);
				weeklyMode = true;
				weeklySheets = nextWeeklySheets;
				totalWeeks = Math.max(1, maxWeekNo);
				currentWeek = Math.min(currentWeek, totalWeeks);
				if (!weeklySheets[String(currentWeek)]) {
					currentWeek = weeklySheetEntries[0].weekNo || 1;
				}
				syncViewFromWeekly();
				termName = extractTermName(weeklySheetEntries[0].sheetName, weeklySheetEntries[0].title) || termName;
				importMessage = `导入成功：${file.name}（按周模式 ${weeklySheetEntries.length} 周）`;
				return;
			}

			const first = parsedSheets[0];
			weeklyMode = false;
			weeklySheets = {};
			periods = first.periods;
			courses = first.courses;
			termName = extractTermName(first.sheetName, first.title) || first.sheetName || termName;
			if (first.weekNo) {
				totalWeeks = Math.max(totalWeeks, first.weekNo);
				currentWeek = Math.min(currentWeek, totalWeeks);
			}
			importMessage = `导入成功：${file.name}`;
		} catch (error) {
			importError = error instanceof Error ? error.message : "导入失败";
		} finally {
			input.value = "";
		}
	}

	function onFilePick() {
		fileInput?.click();
	}
</script>

<section class="tt-root">
	<header class="tt-header">
		<div>
			<h1>{termName}</h1>
			<p>共 {totalWeeks} 周 ·</p>
		</div>
		<a href="/" class="home-btn" data-no-swup>⌂ 返回首页</a>
	</header>

	<div class="week-row">
		<button type="button" class="week-nav" on:click={prevWeek} aria-label="上一周">‹</button>
		<div class="week-label">第 {currentWeek} 周</div>
		<button type="button" class="week-nav" on:click={nextWeek} aria-label="下一周">›</button>
		<button
			type="button"
			class:list={["week-current", { "is-target": isViewingDetectedWeek }]}
			on:click={setCurrentWeekTag}
			disabled={isViewingDetectedWeek}
		>
			{isViewingDetectedWeek ? "当前周" : "定位当前周"}
		</button>
	</div>
	{#if !canEdit}
		<p class="read-only-tip">当前为共享只读视图。若要修改，请先在开发者编辑器完成口令验证。</p>
	{/if}

	<section class="table-shell">
		<table class="timetable">
			<thead>
				<tr>
					<th class="period-col">节次</th>
					{#each DISPLAY_DAYS as day}
						<th>{DAY_LABELS[day]}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each periods as period (period.id)}
					<tr>
						<td class="period-cell">
							<div class="period-title">{period.label}</div>
							<div class="period-time">{period.time || "--:-- - --:--"}</div>
						</td>
						{#each DISPLAY_DAYS as day}
							{@const key = courseKey(period.id, day)}
							{@const item = getDisplayCourse(period.id, day)}
							<td class:list={["course-cell", { inactive: !!item && !isActiveCourse(item) }]}>
								{#if item}
									<button
										type="button"
										class:list={["course-slot", { inactive: !isActiveCourse(item) }]}
										on:click={() => openEditor(period.id, day)}
									>
										<div
											class="course-card"
											style={`border-left-color:${item.color};background:${toSoftBg(item.color)};box-shadow:inset 0 0 0 1px ${toCardRing(item.color)};`}
										>
											<p class="course-name">{item.course}</p>
											<p class="course-meta">{item.weeks || ""}</p>
											<p class="course-meta">教室: {item.location || "未填写"}</p>
											<p class="course-meta">教师: {item.teacher || "未填写"}</p>
										</div>
									</button>
								{:else}
									<button type="button" class="course-slot" on:click={() => openEditor(period.id, day)}>
										<span class="course-empty">—</span>
									</button>
								{/if}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</section>

	{#if canEdit}
		<details bind:open={toolsOpen} class="tools-panel">
			<summary>导入与编辑</summary>
			<div class="tools-grid">
				<div class="tools-row">
					<label>
						<span>学期名</span>
						<input bind:value={termName} placeholder="大一下2" />
					</label>
					<label>
						<span>总周数</span>
						<input type="number" min="1" bind:value={totalWeeks} />
					</label>
					<label>
						<span>开学日期</span>
						<input type="date" bind:value={termStartDate} />
					</label>
				</div>
				<div class="tools-actions">
					<button type="button" class="plain-btn" on:click={saveNow} disabled={isSaving}>
						{isSaving ? "保存中..." : "保存课程表"}
					</button>
					<button type="button" class="plain-btn" on:click={onFilePick}>导入 xls/xlsx</button>
					<button type="button" class="plain-btn" on:click={addPeriod}>添加节次</button>
					<button type="button" class="plain-btn danger" on:click={resetAll}>重置全部</button>
					<input bind:this={fileInput} type="file" accept=".xls,.xlsx,.csv" class="hidden" on:change={importExcel} />
				</div>
				{#if importMessage}<p class="msg success">{importMessage}</p>{/if}
				{#if importError}<p class="msg error">{importError}</p>{/if}
				<div class="period-editor-list">
					{#each periods as period (period.id)}
						<div class="period-editor-item">
							<input bind:value={period.label} placeholder="节次标题" />
							<input bind:value={period.time} placeholder="08:20 - 09:45" />
							<button type="button" class="mini-danger" on:click={() => removePeriod(period.id)}>删除</button>
						</div>
					{/each}
				</div>
			</div>
		</details>
	{:else}
		{#if importMessage}<p class="msg success">{importMessage}</p>{/if}
		{#if importError}<p class="msg error">{importError}</p>{/if}
	{/if}
</section>

{#if modalOpen}
	<div class="modal-mask" role="presentation" on:pointerdown={() => (modalOpen = false)}>
		<div
			class="modal"
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			on:pointerdown|stopPropagation
			on:click|stopPropagation
		>
			<h2>编辑课程</h2>
			<p class="modal-sub">{DAY_LABELS[editingDay]} / {periods.find((p) => p.id === editingPeriodId)?.label || "未命名节次"}</p>
			<label>
				<span>课程名称</span>
				<input bind:value={editingForm.course} placeholder="如：高等数学" />
			</label>
			<label>
				<span>周数</span>
				<input bind:value={editingForm.weeks} placeholder="如：1-18周 / 1-16周(单)" />
			</label>
			<label>
				<span>教室</span>
				<input bind:value={editingForm.location} placeholder="如：2207" />
			</label>
			<label>
				<span>教师</span>
				<input bind:value={editingForm.teacher} placeholder="如：张老师" />
			</label>
			<div>
				<span class="color-title">颜色</span>
				<div class="color-row">
					<input
						type="color"
						class="color-picker"
						bind:value={editingForm.color}
						aria-label="自定义颜色"
						on:input={(event) =>
							(editingForm = { ...editingForm, color: (event.currentTarget as HTMLInputElement).value })}
					/>
					{#each CARD_COLORS as color}
						<button
							type="button"
							class={`color-dot ${editingForm.color === color ? "active" : ""}`}
							style={`--dot:${color};`}
							aria-label={`选择颜色 ${color}`}
							on:pointerdown|preventDefault={() => (editingForm = { ...editingForm, color })}
							on:click|preventDefault={() => (editingForm = { ...editingForm, color })}
						>
							<span class="dot-inner"></span>
						</button>
					{/each}
					<span class="color-value">{editingForm.color}</span>
				</div>
			</div>
			<div class="modal-actions">
				<button type="button" class="plain-btn" on:click={saveEditor}>保存</button>
				<button type="button" class="plain-btn" on:click={() => (modalOpen = false)}>取消</button>
				<button type="button" class="plain-btn danger" on:click={deleteCurrentCourse}>删除</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.tt-root {
		width: min(100%, 1280px);
		margin: 2px auto 22px;
		display: grid;
		gap: 14px;
		background: transparent;
	}

	.tt-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 10px;
	}

	.tt-header h1 {
		margin: 0;
		font-size: clamp(2.45rem, 3.5vw, 3.25rem);
		font-weight: 800;
		line-height: 1.08;
		color: #111;
		letter-spacing: 0.01em;
	}

	.tt-header p {
		margin: 6px 0 0 2px;
		font-size: 1.04rem;
		font-weight: 500;
		color: #475569;
	}

	.home-btn {
		height: 34px;
		padding: 0 18px;
		border-radius: 999px;
		border: 1px solid #d1d5db;
		background: #ececec;
		color: #111;
		text-decoration: none;
		font-size: 0.92rem;
		font-weight: 600;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
	}

	.home-btn:hover {
		background: #e7e7e7;
	}

	.week-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.read-only-tip {
		margin: 0;
		font-size: 0.92rem;
		font-weight: 600;
		color: #475569;
	}

	.week-nav {
		width: 38px;
		height: 38px;
		border-radius: 999px;
		border: 1px solid #d1d5db;
		background: #efefef;
		color: #111;
		font-size: 1.4rem;
		line-height: 1;
	}

	.week-label {
		font-size: 1.88rem;
		font-weight: 500;
		color: #111;
		min-width: 106px;
		text-align: center;
	}

	.week-current {
		height: 28px;
		padding: 0 12px;
		border-radius: 999px;
		border: 1px solid #111;
		background: #111;
		color: #fff;
		font-size: 0.88rem;
		font-weight: 600;
	}

	.week-current.is-target {
		border-color: #14532d;
		background: #14532d;
	}

	.week-current:disabled {
		cursor: default;
		opacity: 1;
	}

	.table-shell {
		overflow: auto;
		border: 1px solid #d4d4d8;
		border-radius: 18px;
		background: #fff;
	}

	.timetable {
		width: 100%;
		min-width: 1020px;
		border-collapse: collapse;
	}

	th,
	td {
		border-right: 1px solid #d1d5db;
		border-bottom: 1px solid #d1d5db;
		vertical-align: top;
		background: #fff;
	}

	th:last-child,
	td:last-child {
		border-right: none;
	}

	tbody tr:last-child td {
		border-bottom: none;
	}


	th {
		height: 68px;
		padding: 0 16px;
		font-size: 1.75rem;
		font-weight: 700;
		text-align: left;
		background: #fff;
		color: #0f172a;
	}

	.period-col {
		width: 170px;
	}

	.period-cell {
		padding: 11px 14px;
		min-height: 122px;
	}

	.period-title {
		font-size: 1.58rem;
		font-weight: 700;
		line-height: 1.2;
		color: #0f172a;
	}

	.period-time {
		margin-top: 3px;
		font-size: 1rem;
		font-weight: 500;
		color: #64748b;
	}

	.course-slot {
		width: 100%;
		min-height: 122px;
		padding: 8px 10px !important;
		border: none;
		background: transparent;
		display: grid;
		place-items: center;
	}

	.course-slot:hover {
		background: rgba(148, 163, 184, 0.06);
	}

	.course-slot:active {
		transform: none;
		filter: none;
	}

	.course-empty {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		min-height: 98px;
		font-size: 1.28rem;
		font-weight: 500;
		color: #64748b;
	}

	.course-card {
		flex: 0 1 auto;
		width: min(100%, 280px);
		min-height: 98px;
		padding: 11px 14px;
		margin: 0;
		border-radius: 12px;
		border-left: 4px solid #94a3b8;
		background: #eef2f5;
		box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.35);
		display: grid;
		gap: 3px;
		text-align: left;
		align-content: flex-start;
	}

	.course-slot.inactive .course-card {
		opacity: 0.74;
	}

	.course-meta {
		margin: 0;
		font-size: 0.86rem;
		line-height: 1.35;
		color: #475569;
	}

	.course-name {
		font-size: 1.05rem !important;
		font-weight: 700;
		color: #0b1220 !important;
		line-height: 1.22;
		margin: 0 0 3px !important;
	}

	.course-cell {
		min-height: 122px;
		padding: 0 !important;
		vertical-align: middle;
	}

	.tools-panel {
		border: 1px solid #d8d8d8;
		border-radius: 14px;
		background: #fff;
		overflow: hidden;
	}

	.tools-panel > summary {
		list-style: none;
		cursor: pointer;
		padding: 12px 14px;
		font-weight: 800;
		font-size: 1rem;
		border-bottom: 1px solid #e0e0e0;
	}

	.tools-grid {
		padding: 12px;
		display: grid;
		gap: 10px;
	}

	.tools-row {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 10px;
	}

	label {
		display: grid;
		gap: 6px;
	}

	label span,
	.color-title {
		font-size: 0.88rem;
		font-weight: 700;
		color: #374151;
	}

	input {
		height: 36px;
		border: 1px solid #d1d5db;
		border-radius: 8px;
		padding: 0 10px;
		background: #fff;
	}

	.tools-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.plain-btn {
		height: 34px;
		padding: 0 12px;
		border-radius: 999px;
		border: 1px solid #d1d5db;
		background: #fff;
		font-size: 0.9rem;
		font-weight: 700;
	}

	.plain-btn.danger,
	.mini-danger {
		color: #b91c1c;
	}

	.msg {
		margin: 0;
		font-size: 0.88rem;
		font-weight: 700;
	}

	.msg.success {
		color: #166534;
	}

	.msg.error {
		color: #b42318;
	}

	.period-editor-list {
		display: grid;
		gap: 8px;
	}

	.period-editor-item {
		display: grid;
		grid-template-columns: 1fr 1fr auto;
		gap: 8px;
	}

	.mini-danger {
		height: 36px;
		padding: 0 10px;
		border-radius: 8px;
		border: 1px solid #d1d5db;
		background: #fff;
		font-size: 0.84rem;
		font-weight: 700;
	}

	.hidden {
		display: none;
	}

	.modal-mask {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.35);
		display: grid;
		place-items: center;
		padding: 14px;
		z-index: 80;
	}

	.modal {
		width: min(100%, 460px);
		padding: 16px;
		border-radius: 14px;
		border: 1px solid #d8d8d8;
		background: #fff;
		display: grid;
		gap: 10px;
	}

	.modal h2 {
		margin: 0;
		font-size: 1.2rem;
		font-weight: 800;
	}

	.modal-sub {
		margin: 0;
		font-size: 0.9rem;
		color: #6b7280;
	}

	.color-row {
		margin-top: 6px;
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		align-items: center;
	}

	.color-picker {
		width: 24px;
		height: 18px;
		padding: 0;
		border: 1px solid #94a3b8;
		border-radius: 2px;
		background: #fff;
		cursor: pointer;
		overflow: hidden;
	}

	.color-dot {
		width: 22px;
		height: 22px;
		border-radius: 999px;
		border: 1px solid #94a3b8;
		background: #f8fafc;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0;
	}

	.color-dot.active {
		outline: 2px solid #111;
		outline-offset: 1px;
	}

	.dot-inner {
		width: 16px;
		height: 16px;
		border-radius: 999px;
		background: var(--dot);
		display: inline-block;
	}

	.color-value {
		margin-left: 4px;
		font-size: 0.82rem;
		color: #475569;
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
	}

	.modal-actions {
		display: flex;
		gap: 8px;
		justify-content: flex-end;
	}

	@media (max-width: 980px) {
		.tt-header {
			align-items: center;
		}

		.tt-header h1 {
			font-size: clamp(1.7rem, 7vw, 2.5rem);
		}

		.tt-header p {
			font-size: 1rem;
		}

		.week-label {
			font-size: 1.1rem;
			min-width: 80px;
		}

		th {
			font-size: 1.02rem;
		}

		.period-title,
		.course-name {
			font-size: 0.96rem !important;
		}

		.period-time,
		.course-meta {
			font-size: 0.84rem;
		}

		.tools-row,
		.period-editor-item {
			grid-template-columns: 1fr;
		}
	}
</style>
