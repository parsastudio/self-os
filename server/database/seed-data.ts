import type { HabitTimeSlot, TrackingMode } from '~/domain/schemas';

export interface SeedHabitDefinition {
	id: string;
	parentId: string | null;
	title: string;
	category: string;
	trackingMode: TrackingMode;
	timeSlot: HabitTimeSlot;
	isSituational: boolean;
	scheduleLabel: string | null;
	notes: string | null;
	bronzeDesc: string | null;
	silverDesc: string | null;
	goldDesc: string | null;
	emergencyMinDesc: string | null;
	sortOrder: number;
	createdAtJalali: string;
}

export interface RawDailySheetRow {
	jalaliDate: string;
	scores: {
		morningWorship?: number | '-';
		toothbrushing?: number | '-';
		prayersGroup?: number | '-';
		bookReading?: number | '-';
		studying?: number | '-';
		abstinence?: number | '-';
		workLife?: number | '-';
		languageLearning?: number | '-';
	};
}

export const SEED_BOOKS_ORDER: ReadonlyArray<{
	title: string;
	author: string | null;
	notes: string | null;
}> = [
	{ title: 'چگونه کمالگرا نباشیم؟', author: 'استیون گایز', notes: 'معتبر از تاریخ ۱۳ اردیبهشت سال ۱۴۰۵' },
	{ title: 'عادت های اتمی', author: 'جیمز کلیر', notes: null },
	{ title: 'انسان در قران', author: 'مرتضی مطهری', notes: null },
	{ title: 'تندتر از عقربه ها حرکت کن', author: null, notes: null },
	{ title: '1984', author: 'جورج اورول', notes: null },
	{ title: 'تشیع علوی تشیع صفوی', author: 'علی شریعتی', notes: null },
	{ title: 'صحیفه ی سجادیه', author: 'امام سجاد (ع)', notes: 'نوبت اول مطالعه در سال ۱۴۰۵' },
	{ title: 'فاطمه فاطمه است', author: 'علی شریعتی', notes: null },
	{ title: 'چگونه ایده های خوب را بدزدیم', author: 'آستین کلئون', notes: null },
	{ title: 'مومن متعادل', author: null, notes: null },
	{ title: 'اقتصاد به زبان ساده', author: null, notes: null },
	{ title: 'آینده ی انقلاب اسلامی', author: 'مرتضی مطهری', notes: null },
	{ title: 'صحیفه ی سجادیه', author: 'امام سجاد (ع)', notes: 'نوبت دوم مطالعه در سال ۱۴۰۵' },
	{ title: 'ولاء ها و ولایت ها مرتضی مطهری', author: 'مرتضی مطهری', notes: null },
	{ title: 'نظری به اقتصاد اسلامی (مرتضی مطهری)', author: 'مرتضی مطهری', notes: null },
	{ title: 'نهج البلاغه', author: 'امیرالمومنین علی (ع)', notes: null },
	{ title: 'اجازه نده هر چیزی روی تو تاثیر بگذارد', author: null, notes: null },
	{ title: 'فارسی شکر است', author: 'محمدعلی جمال‌زاده', notes: null },
	{ title: 'من با خدای کوچکم قهرم', author: null, notes: null },
	{ title: 'قطار نیمه شب', author: null, notes: null },
	{ title: 'روانشناسی پول', author: 'مورگان هاوزل', notes: null },
	{ title: 'مادرخوانده', author: null, notes: null },
	{ title: 'طعم هم سخنی', author: null, notes: null },
	{ title: 'صحیفه ی سجادیه', author: 'امام سجاد (ع)', notes: 'نوبت سوم مطالعه در سال ۱۴۰۵' },
	{ title: 'در خیمه حسین', author: null, notes: null },
	{ title: 'صحیفه ی سجادیه', author: 'امام سجاد (ع)', notes: 'نوبت چهارم مطالعه در سال ۱۴۰۵' }
];

export const SEED_HABITS: ReadonlyArray<SeedHabitDefinition> = [
	{
		id: 'habit-morning-worship',
		parentId: null,
		title: 'عبادات صبح',
		category: 'معنوی',
		trackingMode: 'tiered',
		timeSlot: 'morning',
		isSituational: false,
		scheduleLabel: 'بعد از نماز صبح',
		notes: null,
		bronzeDesc: '5 هزار تومن صدقه',
		silverDesc: '5 هزار تومن صدقه',
		goldDesc: '5 هزار تومن صدقه',
		emergencyMinDesc: null,
		sortOrder: 1,
		createdAtJalali: '1405/01/13'
	},
	{
		id: 'habit-toothbrushing',
		parentId: null,
		title: 'مسواک زدن',
		category: 'سلامت',
		trackingMode: 'tiered',
		timeSlot: 'day',
		isSituational: false,
		scheduleLabel: 'هنگام وضو اذان ظهر یا قبل از خروج از خانه',
		notes: null,
		bronzeDesc: 'مسواک زدن',
		silverDesc: '~',
		goldDesc: '~',
		emergencyMinDesc: null,
		sortOrder: 2,
		createdAtJalali: '1405/01/13'
	},
	{
		id: 'habit-prayers-group',
		parentId: null,
		title: 'طرح خواندن ادعیه',
		category: 'معنوی',
		trackingMode: 'tiered',
		timeSlot: 'day',
		isSituational: false,
		scheduleLabel: '-',
		notes: 'در صورتی که هر کدوم از طرح های مربوط به این دسته کامل نبود باید به درستی و به ترتیبشون اینجا نوشتشون.',
		bronzeDesc: null,
		silverDesc: null,
		goldDesc: null,
		emergencyMinDesc: null,
		sortOrder: 3,
		createdAtJalali: '1405/01/13'
	},
	{
		id: 'habit-sub-quran',
		parentId: 'habit-prayers-group',
		title: 'خواندن قران',
		category: 'معنوی',
		trackingMode: 'tiered',
		timeSlot: 'day',
		isSituational: false,
		scheduleLabel: 'بعد از نماز ظهر',
		notes: null,
		bronzeDesc: 'خوندن یک صفحه معنی قران',
		silverDesc: 'خونندن دو صفحه معنی قران',
		goldDesc: 'خوندن سه صفحه معنی قران',
		emergencyMinDesc: null,
		sortOrder: 4,
		createdAtJalali: '1405/01/13'
	},
	{
		id: 'habit-sub-nahj',
		parentId: 'habit-prayers-group',
		title: 'خواندن نهج البلاغه',
		category: 'معنوی',
		trackingMode: 'tiered',
		timeSlot: 'night',
		isSituational: false,
		scheduleLabel: 'بعد نماز مغرب و عشا',
		notes: null,
		bronzeDesc: 'یک صفحه معنی در فیدیبو',
		silverDesc: 'سه صفحه معنی در فیدیبو',
		goldDesc: 'پنج صفحه معنی',
		emergencyMinDesc: null,
		sortOrder: 5,
		createdAtJalali: '1405/01/13'
	},
	{
		id: 'habit-sub-sahifa',
		parentId: 'habit-prayers-group',
		title: 'خواندن صحیفه سجادیه',
		category: 'معنوی',
		trackingMode: 'tiered',
		timeSlot: 'day',
		isSituational: false,
		scheduleLabel: 'بعد از قران',
		notes: null,
		bronzeDesc: 'خواندن یک آیه',
		silverDesc: 'خواندن ده آیه',
		goldDesc: 'خواندن بیست آیه',
		emergencyMinDesc: null,
		sortOrder: 6,
		createdAtJalali: '1405/01/13'
	},
	{
		id: 'habit-book',
		parentId: null,
		title: 'طرح کتاب',
		category: 'یادگیری',
		trackingMode: 'tiered',
		timeSlot: 'day',
		isSituational: true,
		scheduleLabel: null,
		notes: null,
		bronzeDesc: 'خوندن 5 دقیقه کتاب',
		silverDesc: 'خواندن 10 دقیقه کتاب',
		goldDesc: 'خواندن 20 دقیقه کتاب',
		emergencyMinDesc: null,
		sortOrder: 7,
		createdAtJalali: '1405/01/13'
	},
	{
		id: 'habit-study',
		parentId: null,
		title: 'طرح درس',
		category: 'یادگیری',
		trackingMode: 'tiered',
		timeSlot: 'day',
		isSituational: true,
		scheduleLabel: null,
		notes: null,
		bronzeDesc: '5 دقیقه درس',
		silverDesc: '10 دقیقه درس',
		goldDesc: '25 دقیقه درس',
		emergencyMinDesc: null,
		sortOrder: 8,
		createdAtJalali: '1405/01/16'
	},
	{
		id: 'habit-abstinence',
		parentId: null,
		title: 'ترک خود ارضایی',
		category: 'رشد فردی',
		trackingMode: 'tiered',
		timeSlot: 'night',
		isSituational: true,
		scheduleLabel: '-',
		notes: null,
		bronzeDesc: 'فقط رفتن به صفحه ی mollyredwolf',
		silverDesc: 'فقط استفاده از 7 پورن داخل کامپیوتر',
		goldDesc: 'خوودارضایی فقط به صورت فیزیکی بدون استفاده از هیچ ابزار کمکی ای',
		emergencyMinDesc: null,
		sortOrder: 9,
		createdAtJalali: '1405/03/22'
	},
	{
		id: 'habit-work-life',
		parentId: null,
		title: 'طرح زندگی کاری',
		category: 'کار',
		trackingMode: 'tiered',
		timeSlot: 'morning',
		isSituational: false,
		scheduleLabel: 'بعد از بیدار شدن',
		notes: 'این طرح اگه کسی از بچه ها پیشنهاد بازی داد حساب نمیشه و میشه باهاشون بازی کرد بدون مشکل',
		bronzeDesc: 'تفریح از ساعت 12 به بعد',
		silverDesc: 'تفریح از ساعت 4 به بعد',
		goldDesc: 'تفریح از ساعت 7 تا 12',
		emergencyMinDesc: null,
		sortOrder: 10,
		createdAtJalali: '1405/04/25'
	},
	{
		id: 'habit-language',
		parentId: null,
		title: 'طرح زبان',
		category: 'یادگیری',
		trackingMode: 'tiered',
		timeSlot: 'day',
		isSituational: false,
		scheduleLabel: null,
		notes: null,
		bronzeDesc: '5 دقیقه زبان',
		silverDesc: '10 دقیقه زبان',
		goldDesc: '20 دقیقه زبان',
		emergencyMinDesc: null,
		sortOrder: 11,
		createdAtJalali: '1405/07/16'
	}
];

export const SEED_REFLECTION_TAGS: ReadonlyArray<string> = [
	'خستگی',
	'کم‌خوابی',
	'مشکلات اینترنت',
	'اهمال‌کاری',
	'بیرون بودن',
	'انگیزه بالا',
	'تمرکز عمیق',
	'پیشنهاد بازی بچه‌ها',
	'مهمانی یا سفر'
];

export const SEED_DAILY_ROWS: ReadonlyArray<RawDailySheetRow> = [
	{ jalaliDate: '1405/01/13', scores: { morningWorship: 3, toothbrushing: 1, prayersGroup: 3, bookReading: 1 } },
	{ jalaliDate: '1405/01/14', scores: { morningWorship: 3, toothbrushing: 1, prayersGroup: 3, bookReading: 1 } },
	{ jalaliDate: '1405/01/15', scores: { morningWorship: 3, toothbrushing: 1, prayersGroup: 3, bookReading: 1 } },
	{ jalaliDate: '1405/01/16', scores: { morningWorship: 3, toothbrushing: 1, prayersGroup: 3, bookReading: 1, studying: 2 } },
	{ jalaliDate: '1405/01/17', scores: { morningWorship: 3, toothbrushing: 1, prayersGroup: 3, bookReading: 1, studying: 1 } },
	{ jalaliDate: '1405/01/18', scores: { morningWorship: 3, toothbrushing: 1, prayersGroup: 3, bookReading: 2, studying: 1 } },
	{ jalaliDate: '1405/01/19', scores: { morningWorship: 3, toothbrushing: 1, prayersGroup: 3, bookReading: 1, studying: 1 } },
	{ jalaliDate: '1405/01/20', scores: { morningWorship: 3, toothbrushing: 1, prayersGroup: 3, bookReading: 1, studying: 1 } }
];
