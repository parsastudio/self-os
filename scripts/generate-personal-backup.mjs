import fs from 'node:fs';
import path from 'node:path';
import jalaali from 'jalaali-js';

function jalaliToIso(jy, jm, jd) {
	const { gy, gm, gd } = jalaali.toGregorian(jy, jm, jd);
	return `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
}

const rawBooks = [
	'چگونه کمالگرا نباشیم؟',
	'عادت های اتمی',
	'انسان در قران',
	'تندتر از عقربه ها حرکت کن',
	'1984',
	'تشیع علوی تشیع صفوی',
	'صحیفه ی سجادیه',
	'فاطمه فاطمه است',
	'چگونه ایده های خوب را بدزدیم',
	'مومن متعادل',
	'اقتصاد به زبان ساده',
	'آینده ی انقلاب اسلامی',
	'صحیفه ی سجادیه',
	'ولاء ها و ولایت ها مرتضی مطهری',
	'نظری به اقتصاد اسلامی (مرتضی مطهری)',
	'نهج البلاغه',
	'اجازه نده هر چیزی روی تو تاثیر بگذارد',
	'فارسی شکر است',
	'من با خدای کوچکم قهرم',
	'قطار نیمه شب',
	'روانشناسی پول',
	'مادرخوانده',
	'طعم هم سخنی',
	'صحیفه ی سجادیه',
	'در خیمه حسین',
	'صحیفه ی سجادیه'
];

// 26 books distributed with ~8 days interval from 1405/01/20 to 1405/08/06
const bookFinishDatesJalali = [
	[1405, 1, 20], [1405, 1, 28], [1405, 2, 5],  [1405, 2, 13], [1405, 2, 21],
	[1405, 2, 29], [1405, 3, 6],  [1405, 3, 14], [1405, 3, 22], [1405, 3, 30],
	[1405, 4, 7],  [1405, 4, 15], [1405, 4, 23], [1405, 4, 31], [1405, 5, 8],
	[1405, 5, 16], [1405, 5, 24], [1405, 6, 1],  [1405, 6, 9],  [1405, 6, 17],
	[1405, 6, 25], [1405, 7, 16], [1405, 7, 21], [1405, 7, 26], [1405, 8, 1],
	[1405, 8, 6]
];

const books = rawBooks.map((title, idx) => {
	const [jy, jm, jd] = bookFinishDatesJalali[idx] || [1405, 8, 6];
	const finishedAtIso = jalaliToIso(jy, jm, jd);
	return {
		id: `book-hist-${idx + 1}`,
		title,
		author: null,
		status: 'completed',
		startedAtIso: null,
		finishedAtIso,
		rating: 5,
		notes: null,
		createdAtIso: finishedAtIso,
		updatedAtIso: `${finishedAtIso}T12:00:00.000Z`
	};
});

// Habits configuration with creation dates set to the day first data entry occurred
const habits = [
	{
		id: 'habit-sadaqah',
		parentId: null,
		title: 'طرح صدقه (عبادات صبح)',
		category: 'معنوی',
		trackingMode: 'tiered',
		timeSlot: 'morning',
		isSituational: false,
		status: 'active',
		scheduleLabel: 'بعد از نماز صبح',
		notes: null,
		bronzeDesc: '5 هزار تومن صدقه',
		silverDesc: '5 هزار تومن صدقه',
		goldDesc: '5 هزار تومن صدقه',
		emergencyMinDesc: null,
		defaultIntervals: 2,
		defaultMinutesPerInterval: 10,
		cadenceWindowMinutes: 60,
		sortOrder: 1,
		createdAtIso: jalaliToIso(1405, 1, 13),
		updatedAtIso: `${jalaliToIso(1405, 1, 13)}T06:00:00.000Z`
	},
	{
		id: 'habit-teeth',
		parentId: null,
		title: 'مسواک زدن',
		category: 'سلامت',
		trackingMode: 'tiered',
		timeSlot: 'day',
		isSituational: false,
		status: 'active',
		scheduleLabel: 'هنگام وضو اذان ظهر یا قبل از خروج از خانه',
		notes: null,
		bronzeDesc: 'مسواک زدن',
		silverDesc: null,
		goldDesc: null,
		emergencyMinDesc: null,
		defaultIntervals: 2,
		defaultMinutesPerInterval: 10,
		cadenceWindowMinutes: 60,
		sortOrder: 2,
		createdAtIso: jalaliToIso(1405, 1, 13),
		updatedAtIso: `${jalaliToIso(1405, 1, 13)}T06:00:00.000Z`
	},
	{
		id: 'habit-adiah',
		parentId: null,
		title: 'طرح خواندن ادعیه',
		category: 'معنوی',
		trackingMode: 'tiered',
		timeSlot: 'day',
		isSituational: false,
		status: 'active',
		scheduleLabel: 'بعد از نمازها',
		notes: 'مجموعه‌طرح قرآن، نهج‌البلاغه و صحیفه سجادیه',
		bronzeDesc: null,
		silverDesc: null,
		goldDesc: null,
		emergencyMinDesc: null,
		defaultIntervals: 2,
		defaultMinutesPerInterval: 10,
		cadenceWindowMinutes: 60,
		sortOrder: 3,
		createdAtIso: jalaliToIso(1405, 1, 13),
		updatedAtIso: `${jalaliToIso(1405, 1, 13)}T06:00:00.000Z`
	},
	{
		id: 'habit-quran',
		parentId: 'habit-adiah',
		title: 'خواندن قرآن',
		category: 'معنوی',
		trackingMode: 'tiered',
		timeSlot: 'day',
		isSituational: false,
		status: 'active',
		scheduleLabel: 'بعد از نماز ظهر',
		notes: null,
		bronzeDesc: 'خوندن یک صفحه معنی قران',
		silverDesc: 'خوندن دو صفحه معنی قران',
		goldDesc: 'خوندن سه صفحه معنی قران',
		emergencyMinDesc: null,
		defaultIntervals: 2,
		defaultMinutesPerInterval: 10,
		cadenceWindowMinutes: 60,
		sortOrder: 4,
		createdAtIso: jalaliToIso(1405, 1, 13),
		updatedAtIso: `${jalaliToIso(1405, 1, 13)}T06:00:00.000Z`
	},
	{
		id: 'habit-nahj',
		parentId: 'habit-adiah',
		title: 'خواندن نهج البلاغه',
		category: 'معنوی',
		trackingMode: 'tiered',
		timeSlot: 'night',
		isSituational: false,
		status: 'active',
		scheduleLabel: 'بعد نماز مغرب و عشا',
		notes: null,
		bronzeDesc: 'یک صفحه معنی در فیدیبو',
		silverDesc: 'سه صفحه معنی در فیدیبو',
		goldDesc: 'پنج صفحه معنی',
		emergencyMinDesc: null,
		defaultIntervals: 2,
		defaultMinutesPerInterval: 10,
		cadenceWindowMinutes: 60,
		sortOrder: 5,
		createdAtIso: jalaliToIso(1405, 1, 13),
		updatedAtIso: `${jalaliToIso(1405, 1, 13)}T06:00:00.000Z`
	},
	{
		id: 'habit-sahifeh',
		parentId: 'habit-adiah',
		title: 'خواندن صحیفه سجادیه',
		category: 'معنوی',
		trackingMode: 'tiered',
		timeSlot: 'day',
		isSituational: false,
		status: 'active',
		scheduleLabel: 'بعد از قرآن',
		notes: null,
		bronzeDesc: 'خواندن یک آیه',
		silverDesc: 'خواندن ده آیه',
		goldDesc: 'خواندن بیست آیه',
		emergencyMinDesc: null,
		defaultIntervals: 2,
		defaultMinutesPerInterval: 10,
		cadenceWindowMinutes: 60,
		sortOrder: 6,
		createdAtIso: jalaliToIso(1405, 1, 13),
		updatedAtIso: `${jalaliToIso(1405, 1, 13)}T06:00:00.000Z`
	},
	{
		id: 'habit-book',
		parentId: null,
		title: 'طرح کتاب',
		category: 'یادگیری',
		trackingMode: 'tiered',
		timeSlot: 'day',
		isSituational: false,
		status: 'active',
		scheduleLabel: 'در طول روز',
		notes: null,
		bronzeDesc: 'خوندن 5 دقیقه کتاب',
		silverDesc: 'خواندن 10 دقیقه کتاب',
		goldDesc: 'خواندن 20 دقیقه کتاب',
		emergencyMinDesc: null,
		defaultIntervals: 2,
		defaultMinutesPerInterval: 10,
		cadenceWindowMinutes: 60,
		sortOrder: 7,
		createdAtIso: jalaliToIso(1405, 1, 13),
		updatedAtIso: `${jalaliToIso(1405, 1, 13)}T06:00:00.000Z`
	},
	{
		id: 'habit-study',
		parentId: null,
		title: 'طرح درس',
		category: 'یادگیری',
		trackingMode: 'tiered',
		timeSlot: 'day',
		isSituational: false,
		status: 'active',
		scheduleLabel: 'در طول روز',
		notes: null,
		bronzeDesc: '5 دقیقه درس',
		silverDesc: '10 دقیقه درس',
		goldDesc: '25 دقیقه درس',
		emergencyMinDesc: null,
		defaultIntervals: 2,
		defaultMinutesPerInterval: 10,
		cadenceWindowMinutes: 60,
		sortOrder: 8,
		createdAtIso: jalaliToIso(1405, 1, 16),
		updatedAtIso: `${jalaliToIso(1405, 1, 16)}T06:00:00.000Z`
	},
	{
		id: 'habit-quitting',
		parentId: null,
		title: 'ترک خود ارضایی',
		category: 'رشد فردی',
		trackingMode: 'tiered',
		timeSlot: 'day',
		isSituational: true,
		status: 'active',
		scheduleLabel: 'روزانه',
		notes: null,
		bronzeDesc: 'فقط رفتن به صفحه ی mollyredwolf',
		silverDesc: 'فقط استفاده از 7 پورن داخل کامپیوتر',
		goldDesc: 'خودارضایی فقط به صورت فیزیکی بدون استفاده از هیچ ابزار کمکی',
		emergencyMinDesc: null,
		defaultIntervals: 2,
		defaultMinutesPerInterval: 10,
		cadenceWindowMinutes: 60,
		sortOrder: 9,
		createdAtIso: jalaliToIso(1405, 3, 22),
		updatedAtIso: `${jalaliToIso(1405, 3, 22)}T06:00:00.000Z`
	},
	{
		id: 'habit-work',
		parentId: null,
		title: 'طرح زندگی کاری',
		category: 'کار',
		trackingMode: 'tiered',
		timeSlot: 'morning',
		isSituational: false,
		status: 'active',
		scheduleLabel: 'بعد از بیدار شدن',
		notes: 'این طرح اگه کسی از بچه ها پیشنهاد بازی داد حساب نمیشه و میشه باهاشون بازی کرد بدون مشکل',
		bronzeDesc: 'تفریح از ساعت 12 به بعد',
		silverDesc: 'تفریح از ساعت 4 به بعد',
		goldDesc: 'تفریح از ساعت 7 تا 12',
		emergencyMinDesc: null,
		defaultIntervals: 2,
		defaultMinutesPerInterval: 10,
		cadenceWindowMinutes: 60,
		sortOrder: 10,
		createdAtIso: jalaliToIso(1405, 4, 25),
		updatedAtIso: `${jalaliToIso(1405, 4, 25)}T06:00:00.000Z`
	},
	{
		id: 'habit-language',
		parentId: null,
		title: 'طرح زبان',
		category: 'یادگیری',
		trackingMode: 'tiered',
		timeSlot: 'day',
		isSituational: false,
		status: 'active',
		scheduleLabel: 'در طول روز',
		notes: null,
		bronzeDesc: '5 دقیقه زبان',
		silverDesc: '10 دقیقه زبان',
		goldDesc: '20 دقیقه زبان',
		emergencyMinDesc: null,
		defaultIntervals: 2,
		defaultMinutesPerInterval: 10,
		cadenceWindowMinutes: 60,
		sortOrder: 11,
		createdAtIso: jalaliToIso(1405, 7, 16),
		updatedAtIso: `${jalaliToIso(1405, 7, 16)}T06:00:00.000Z`
	}
];

// Mapping helper for tier descriptions
function getRuleDesc(habit, tier) {
	if (tier === 3) return habit.goldDesc || habit.silverDesc || habit.bronzeDesc || null;
	if (tier === 2) return habit.silverDesc || habit.bronzeDesc || null;
	if (tier === 1) return habit.bronzeDesc || null;
	if (tier === 0) return 'عدم انجام';
	if (tier === -1) return 'امروز موقعیتش پیش نیامد';
	return null;
}

// Raw historical tracker entries
// Columns: [dateJalali, sadaqah, teeth, adiah, book, study, quitting, work, language]
const historyRows = [
	['1405/01/13', 3, 1, 3, 1, null, null, null, null],
	['1405/01/14', 3, 1, 3, 1, null, null, null, null],
	['1405/01/15', 3, 1, 3, 1, null, null, null, null],
	['1405/01/16', 3, 1, 3, 1, 2, null, null, null],
	['1405/01/17', 3, 1, 3, 1, 1, null, null, null],
	['1405/01/18', 3, 1, 3, 2, 1, null, null, null],
	['1405/01/19', 3, 1, 3, 1, 1, null, null, null],
	['1405/01/20', 3, 1, 3, 1, 1, null, null, null],
	['1405/01/21', 3, 1, 3, 1, 1, null, null, null],
	['1405/01/22', 3, 1, 3, 1, 1, null, null, null],
	['1405/01/23', 3, 1, 3, 1, 1, null, null, null],
	['1405/01/24', 3, 1, 3, 1, 1, null, null, null],
	['1405/01/25', 3, 1, 3, 1, 1, null, null, null],
	['1405/01/26', 3, 1, 3, 1, 1, null, null, null],
	['1405/01/27', 3, 1, 3, 1, 1, null, null, null],
	['1405/01/28', 3, 1, 3, 1, 1, null, null, null],
	['1405/01/29', 3, 1, 3, 1, 1, null, null, null],
	['1405/01/30', 3, 1, 3, 1, 1, null, null, null],
	['1405/01/31', 3, 1, 3, 1, 1, null, null, null],
	['1405/02/01', 3, 1, 3, 1, 1, null, null, null],
	['1405/02/02', 3, 1, 3, 1, 1, null, null, null],
	['1405/02/03', 3, 1, 3, 1, 1, null, null, null],
	['1405/02/04', 3, 1, 3, 1, 1, null, null, null],
	['1405/02/05', 3, 1, 3, 1, 1, null, null, null],
	['1405/02/06', 3, 1, 3, 1, 1, null, null, null],
	['1405/02/07', 3, 1, 3, 1, 1, null, null, null],
	['1405/02/08', 3, 1, 3, 1, 1, null, null, null],
	['1405/02/09', 3, 1, 3, 1, 1, null, null, null],
	['1405/02/10', 3, 1, 3, 1, 1, null, null, null],
	['1405/02/11', 3, 1, 3, 1, 1, null, null, null],
	['1405/02/12', 3, 1, 3, 1, 1, null, null, null],
	['1405/02/13', 3, 1, 3, 1, 1, null, null, null],
	['1405/02/14', 3, 1, 3, 1, 1, null, null, null],
	['1405/02/15', 3, 1, 3, 1, 1, null, null, null],
	['1405/02/16', 3, 1, 3, 1, 1, null, null, null],
	['1405/02/17', 3, 1, 3, 1, 1, null, null, null],
	['1405/02/18', 3, 1, 3, 1, 1, null, null, null],
	['1405/02/19', 3, 1, 3, 1, 1, null, null, null],
	['1405/02/20', 3, 1, 3, 1, 1, null, null, null],
	['1405/02/21', 3, 1, 3, 1, 1, null, null, null],
	['1405/02/22', 3, 1, 3, 0, 0, null, null, null],
	['1405/02/23', 3, 1, 3, 1, 1, null, null, null],
	['1405/02/24', 3, 1, 3, 1, 1, null, null, null],
	['1405/02/25', 3, 1, 3, 1, 1, null, null, null],
	['1405/02/26', 3, 1, 3, 1, 1, null, null, null],
	['1405/02/27', 3, 1, 3, 1, 1, null, null, null],
	['1405/02/28', 3, 1, 3, 1, 1, null, null, null],
	['1405/02/29', 3, 1, 3, 1, 1, null, null, null],
	['1405/02/30', 3, 1, 3, 0, 0, null, null, null],
	['1405/02/31', 3, 1, 3, 0, 1, null, null, null],
	['1405/03/01', 3, 1, 3, 0, 1, null, null, null],
	['1405/03/02', 3, 1, 3, 1, 1, null, null, null],
	['1405/03/03', 3, 1, 3, 1, 1, null, null, null],
	['1405/03/04', 3, 1, 3, 1, 1, null, null, null],
	['1405/03/05', 3, 1, 3, 0, 0, null, null, null],
	['1405/03/06', 3, 1, 3, 1, 1, null, null, null],
	['1405/03/07', 3, 1, 3, 0, 1, null, null, null],
	['1405/03/08', 3, 1, 3, 1, 1, null, null, null],
	['1405/03/09', 3, 1, 3, 1, 1, null, null, null],
	['1405/03/10', 3, 1, 3, 1, 1, null, null, null],
	['1405/03/11', 3, 1, 3, 1, 1, null, null, null],
	['1405/03/12', 3, 1, 3, 1, 1, null, null, null],
	['1405/03/13', 3, 1, 3, 1, 1, null, null, null],
	['1405/03/14', 3, 1, 3, 1, 1, null, null, null],
	['1405/03/15', 3, 1, 3, 1, 1, null, null, null],
	['1405/03/16', 3, 1, 3, 1, 1, null, null, null],
	['1405/03/17', 3, 1, 3, 1, 1, null, null, null],
	['1405/03/18', 3, 1, 3, 1, 1, null, null, null],
	['1405/03/19', 3, 1, 3, 0, 0, null, null, null],
	['1405/03/20', 3, 1, 3, 1, 1, null, null, null],
	['1405/03/21', 3, 1, 3, 1, 1, null, null, null],
	['1405/03/22', 3, 1, 3, 1, 1, -1, null, null],
	['1405/03/23', 3, 1, 3, 1, 1, 2, null, null],
	['1405/03/24', 3, 1, 3, 1, 1, -1, null, null],
	['1405/03/25', 3, 1, 3, 1, 1, 2, null, null],
	['1405/03/26', 3, 1, 3, 1, 1, -1, null, null],
	['1405/03/27', 3, 1, 3, 0, 0, -1, null, null],
	['1405/03/28', 3, 1, 3, 1, 1, 2, null, null],
	['1405/03/29', 3, 1, 3, 1, 1, -1, null, null],
	['1405/03/30', 3, 1, 3, 1, 1, 2, null, null],
	['1405/03/31', 3, 1, 3, 1, 1, -1, null, null],
	['1405/04/01', 3, 1, 3, 1, 1, -1, null, null],
	['1405/04/02', 3, 1, 3, 1, 1, 2, null, null],
	['1405/04/03', 3, 1, 3, 1, 1, -1, null, null],
	['1405/04/04', 3, 1, 3, 0, 0, 1, null, null],
	['1405/04/05', 3, 1, 3, 1, 1, -1, null, null],
	['1405/04/06', 3, 1, 3, 1, 1, 2, null, null],
	['1405/04/07', 3, 1, 3, 1, 1, -1, null, null],
	['1405/04/08', 3, 1, 3, 1, 1, 2, null, null],
	['1405/04/09', 3, 1, 3, 1, 1, -1, null, null],
	['1405/04/10', 3, 1, 3, 1, 1, -1, null, null],
	['1405/04/11', 3, 1, 3, 1, 1, 2, null, null],
	['1405/04/12', 3, 1, 3, 1, 1, -1, null, null],
	['1405/04/13', 3, 1, 3, 1, 1, 3, null, null],
	['1405/04/14', 3, 1, 3, 1, 1, -1, null, null],
	['1405/04/15', 3, 1, 3, 1, 0, 1, null, null],
	['1405/04/16', 3, 1, 3, 1, 1, -1, null, null],
	['1405/04/17', 3, 1, 3, 1, 1, 3, null, null],
	['1405/04/18', 3, 1, 3, 1, 1, -1, null, null],
	['1405/04/19', 3, 1, 3, 1, 1, -1, null, null],
	['1405/04/20', 3, 1, 3, 1, 1, 3, null, null],
	['1405/04/21', 3, 1, 3, 1, 1, -1, null, null],
	['1405/04/22', 3, 1, 3, 0, 1, -1, null, null],
	['1405/04/23', 3, 1, 3, 0, 0, -1, null, null],
	['1405/04/24', 3, 1, 3, 1, 1, 2, null, null],
	['1405/04/25', 3, 1, 3, 1, 1, -1, 3, null],
	['1405/04/26', 3, 1, 3, 1, 1, -1, 3, null],
	['1405/04/27', 3, 1, 3, 1, 1, 3, 3, null],
	['1405/04/28', 3, 1, 3, 1, -1, -1, 3, null],
	['1405/04/29', 3, 1, 3, 1, -1, 3, 3, null],
	['1405/04/30', 3, 1, 3, 1, -1, -1, 3, null],
	['1405/04/31', 3, 1, 3, 1, -1, -1, 3, null],
	['1405/05/01', 3, 1, 3, 1, -1, 3, 3, null],
	['1405/05/02', 3, 1, 3, 1, -1, -1, 3, null],
	['1405/05/03', 3, 1, 3, 1, -1, -1, 3, null],
	['1405/05/04', 3, 1, 3, 0, 0, -1, 3, null],
	['1405/05/05', 3, 1, 3, 1, 1, 3, 3, null],
	['1405/05/06', 3, 1, 3, 1, 1, -1, 3, null],
	['1405/05/07', 3, 1, 3, 1, 1, 3, 3, null],
	['1405/05/08', 3, 1, 3, 1, 1, -1, 3, null],
	['1405/05/09', 3, 1, 3, 1, 0, -1, 3, null],
	['1405/05/10', 3, 1, 3, 1, 1, 3, 3, null],
	['1405/05/11', 3, 1, 3, 1, 1, -1, 3, null],
	['1405/05/12', 3, 1, 3, 1, 1, -1, 3, null],
	['1405/05/13', 3, 1, 3, 1, 1, 3, 2, null],
	['1405/05/14', 3, 1, 3, 1, 1, -1, 3, null],
	['1405/05/15', 3, 1, 3, 1, 1, -1, 3, null],
	['1405/05/16', 3, 1, 3, 1, 0, 3, 1, null],
	['1405/05/17', 3, 1, 3, 1, 1, -1, 3, null],
	['1405/05/18', 3, 1, 3, 1, 0, 3, 3, null],
	['1405/05/19', 3, 1, 3, 1, 1, -1, 3, null],
	['1405/05/20', 3, 1, 3, 1, 1, -1, 3, null],
	['1405/05/21', 3, 1, 3, 1, 1, 3, 3, null],
	['1405/05/22', 3, 1, 3, 1, 1, -1, 3, null],
	['1405/05/23', 3, 1, 3, 1, 1, -1, 3, null],
	['1405/05/24', 3, 1, 3, 1, 1, 3, 3, null],
	['1405/05/25', 3, 1, 3, 0, 0, -1, 3, null],
	['1405/05/26', 3, 1, 3, 0, 0, -1, 3, null],
	['1405/05/27', 3, 1, 3, 1, 0, 3, 3, null],
	['1405/05/28', 3, 1, 3, 0, 0, -1, 3, null],
	['1405/05/29', 3, 1, 3, 1, 1, 3, 2, null],
	['1405/05/30', 3, 1, 3, 1, 1, -1, 3, null],
	['1405/05/31', 3, 1, 3, 1, 1, 3, 3, null],
	['1405/06/01', 3, 1, 3, 0, 0, -1, 3, null],
	['1405/06/02', 3, 1, 3, 1, 1, 3, 3, null],
	['1405/06/03', 3, 1, 3, 0, 1, -1, 3, null],
	['1405/06/04', 3, 1, 3, 0, 0, -1, 3, null],
	['1405/06/05', 3, 1, 3, 0, 0, 3, 3, null],
	['1405/06/06', 3, 1, 3, 0, 0, -1, 3, null],
	['1405/06/07', 3, 1, 3, 0, 0, 3, 2, null],
	['1405/06/08', 3, 1, 3, 0, 0, -1, 3, null],
	['1405/06/09', 3, 1, 3, 0, 0, 3, 3, null],
	['1405/06/10', 3, 1, 3, 1, 1, -1, 3, null],
	['1405/06/11', 3, 1, 3, 1, 1, -1, 3, null],
	['1405/06/12', 3, 1, 3, 1, 1, -1, 3, null],
	['1405/06/13', 3, 1, 3, -1, 1, 3, 3, null],
	['1405/06/14', 3, 1, 3, -1, 1, -1, 3, null],
	['1405/06/15', 3, 1, 3, -1, 1, -1, 3, null],
	['1405/06/16', 3, 1, 3, -1, null, 3, 3, null],
	['1405/06/17', 3, 1, 3, -1, null, -1, 3, null],
	['1405/06/18', 3, 1, 3, -1, null, 3, 3, null],
	['1405/06/19', 3, 1, 3, -1, null, -1, 3, null],
	['1405/06/20', 3, 1, 3, -1, null, 3, 3, null],
	['1405/06/21', 3, 1, 3, -1, null, -1, 3, null],
	['1405/06/22', 3, 1, 3, -1, null, 3, 3, null],
	['1405/06/23', 3, 1, 3, -1, null, -1, 3, null],
	['1405/06/24', 3, 1, 3, -1, null, -1, 3, null],
	['1405/06/25', 3, 1, 3, -1, null, 3, 3, null],
	['1405/06/26', 3, 1, 3, -1, null, -1, 3, null],
	['1405/06/27', 3, 1, 3, -1, null, -1, 1, null],
	['1405/06/28', 3, 1, 3, -1, null, -1, 3, null],
	['1405/06/29', 3, 1, 3, -1, null, 3, 3, null],
	['1405/06/30', 3, 1, 3, -1, null, -1, 3, null],
	['1405/06/31', 3, 0, 3, -1, null, 3, 3, null],
	['1405/07/01', 3, 0, 3, -1, null, -1, 2, null],
	['1405/07/16', 3, 1, 3, 0, 0, -1, 3, 1],
	['1405/07/17', 3, 1, 3, 1, 0, -1, 3, 1],
	['1405/07/18', 3, 1, 3, 0, 3, 3, 3, 0],
	['1405/07/19', 3, 1, 3, 2, 0, -1, 3, 1],
	['1405/07/20', 3, 1, 3, 2, 0, -1, 3, 1],
	['1405/07/21', 3, 1, 3, 0, 0, 3, 3, 0],
	['1405/07/22', 3, 1, 3, 0, 0, -1, 3, 0],
	['1405/07/23', 3, 1, 3, 0, 0, -1, 3, 0],
	['1405/07/24', 3, 1, 3, 0, 0, 0, 3, 0],
	['1405/07/25', 3, 1, 3, 3, 0, -1, 3, 3],
	['1405/07/26', 3, 1, 3, 0, 0, 1, 3, 0],
	['1405/07/27', 3, 1, 3, 0, 0, -1, 3, 1],
	['1405/07/28', 3, 1, 3, 0, 0, 2, 3, 0],
	['1405/07/29', 3, 1, 3, 0, 0, -1, 3, 0],
	['1405/08/01', 3, 1, 3, 0, 0, -1, 1, 0],
	['1405/08/02', 3, 1, 3, 0, 0, 1, 2, 0],
	['1405/08/03', 3, 1, 3, 3, 0, -1, 3, 2],
	['1405/08/04', 3, 1, 3, 3, 0, 2, 3, 3],
	['1405/08/05', 3, 1, 3, 3, 0, -1, 3, 0],
	['1405/08/06', 3, 1, 3, 3, 0, -1, 3, 1]
];

const habitIdOrder = [
	'habit-sadaqah',
	'habit-teeth',
	'habit-adiah',
	'habit-book',
	'habit-study',
	'habit-quitting',
	'habit-work',
	'habit-language'
];

const habitMap = new Map(habits.map((h) => [h.id, h]));
const dailyEntries = [];
const habitLogs = [];

for (const row of historyRows) {
	const [jalaliDateStr, ...tierValues] = row;
	const [jy, jm, jd] = jalaliDateStr.split('/').map(Number);
	const dateIso = jalaliToIso(jy, jm, jd);
	const dayUpdatedIso = `${dateIso}T20:00:00.000Z`;

	let dayZeroCount = 0;
	let dayPositiveCount = 0;
	let totalActiveHabits = 0;

	for (let i = 0; i < habitIdOrder.length; i++) {
		const habitId = habitIdOrder[i];
		const val = tierValues[i];
		if (val === null || val === undefined) continue;

		totalActiveHabits++;
		const habit = habitMap.get(habitId);
		const achievedTier = Number(val);

		if (achievedTier === 0) dayZeroCount++;
		else if (achievedTier > 0 || achievedTier === -1) dayPositiveCount++;

		habitLogs.push({
			id: `log:${dateIso}:${habitId}`,
			dateIso,
			habitId,
			habitTitleSnapshot: habit?.title || habitId,
			achievedTier,
			achievedRuleSnapshot: habit ? getRuleDesc(habit, achievedTier) : null,
			habitSnapshotJson: habit
				? JSON.stringify({
						title: habit.title,
						category: habit.category,
						scheduleLabel: habit.scheduleLabel,
						notes: habit.notes,
						bronzeDesc: habit.bronzeDesc,
						silverDesc: habit.silverDesc,
						goldDesc: habit.goldDesc,
						isSituational: habit.isSituational
					})
				: null,
			completedIntervals: null,
			actualMinutesPerInterval: null,
			totalActualMinutes: null,
			plannedIntervalsSnapshot: null,
			plannedMinutesSnapshot: null,
			updatedAtIso: dayUpdatedIso
		});

		// If this is the parent composite adiah habit and tier is 3, log subhabits too
		if (habitId === 'habit-adiah' && achievedTier === 3) {
			for (const subId of ['habit-quran', 'habit-nahj', 'habit-sahifeh']) {
				const sub = habitMap.get(subId);
				habitLogs.push({
					id: `log:${dateIso}:${subId}`,
					dateIso,
					habitId: subId,
					habitTitleSnapshot: sub?.title || subId,
					achievedTier: 3,
					achievedRuleSnapshot: sub ? getRuleDesc(sub, 3) : null,
					habitSnapshotJson: sub ? JSON.stringify(sub) : null,
					completedIntervals: null,
					actualMinutesPerInterval: null,
					totalActualMinutes: null,
					plannedIntervalsSnapshot: null,
					plannedMinutesSnapshot: null,
					updatedAtIso: dayUpdatedIso
				});
			}
		}
	}

	let dayStatus = 'optimal';
	if (dayZeroCount > 0 && dayPositiveCount > 0) dayStatus = 'partial';
	else if (dayZeroCount > 0 && dayPositiveCount === 0) dayStatus = 'failed';

	dailyEntries.push({
		id: `entry:${dateIso}`,
		dateIso,
		dayStatus,
		reflectionNote: '',
		journalText: null,
		tagsJson: '[]',
		updatedAtIso: dayUpdatedIso
	});
}

const lifecycleEvents = habits.map((h) => ({
	id: `lifecycle-${h.id}`,
	habitId: h.id,
	habitTitleSnapshot: h.title,
	eventType: h.parentId ? 'CONVERTED_TO_SUBHABIT' : 'CREATED',
	effectiveDateIso: h.createdAtIso,
	summary: h.parentId ? `ایجاد زیرطرح «${h.title}»` : `ایجاد طرح «${h.title}»`,
	reason: 'شروع ردیابی تاریخی طرح‌ها',
	previousStateJson: null,
	newStateJson: JSON.stringify(h),
	createdAtIso: `${h.createdAtIso}T06:00:00.000Z`
}));

const fullBackupPayload = {
	version: 1,
	appName: 'new-life',
	exportedAtIso: new Date().toISOString(),
	jalaliDate: '1405/08/14',
	data: {
		habits,
		dailyEntries,
		habitLogs,
		cadencePlans: [],
		books,
		media: [],
		notes: [],
		calendarEvents: [],
		lifecycleEvents,
		reflectionTags: []
	}
};

const outputPath = path.resolve(process.cwd(), 'my-personal-backup.json');
fs.writeFileSync(outputPath, JSON.stringify(fullBackupPayload, null, 2), 'utf8');

console.log('✅ فایل پشتیبان شخصی با موفقیت ساخته شد:');
console.log(`📁 مسیر فایل: ${outputPath}`);
console.log(`📊 آمار دیتای تبدیل‌شده:`);
console.log(`   - تعداد کتاب‌ها: ${books.length} جلد`);
console.log(`   - تعداد طرح‌ها و زیرطرح‌ها: ${habits.length} طرح`);
console.log(`   - تعداد روزهای ثبت‌شده: ${dailyEntries.length} روز`);
console.log(`   - مجموع لاگ‌های روزانه: ${habitLogs.length} رکورد لاگ`);
