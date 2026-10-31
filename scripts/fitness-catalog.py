import json, shutil
from pathlib import Path
root=Path(__file__).resolve().parents[1]
source=root/'.cache/fitness-source/free-exercise-db-main'
data=json.loads((source/'dist/exercises.json').read_text(encoding='utf-8'))
muscles={'abdominals':'腹直肌、腹斜肌','abductors':'髋外展肌群（臀中肌等）','adductors':'大腿内收肌群','biceps':'肱二头肌','calves':'腓肠肌、比目鱼肌','chest':'胸大肌','forearms':'前臂屈伸肌群','glutes':'臀大肌','hamstrings':'腘绳肌群','lats':'背阔肌','lower back':'竖脊肌','middle back':'菱形肌、斜方肌中部','neck':'颈部肌群','quadriceps':'股四头肌','shoulders':'三角肌','traps':'斜方肌','triceps':'肱三头肌'}
parts={'abdominals':'核心','abductors':'腿','adductors':'腿','biceps':'手臂','calves':'腿','chest':'胸','forearms':'手臂','glutes':'臀','hamstrings':'腿','lats':'背','lower back':'背','middle back':'背','neck':'颈','quadriceps':'腿','shoulders':'肩','traps':'背','triceps':'手臂'}
equipment={'body only':'自重','dumbbell':'哑铃','barbell':'杠铃','cable':'绳索','machine':'固定器械','kettlebells':'壶铃','bands':'弹力带','exercise ball':'健身球','medicine ball':'药球','e-z curl bar':'曲杆','foam roll':'泡沫轴','other':'其他',None:'无器械'}
names={'Wide-Grip Lat Pulldown':'宽握高位下拉','Close-Grip Front Lat Pulldown':'窄握高位下拉','Seated Cable Rows':'坐姿绳索划船','One-Arm Dumbbell Row':'单臂哑铃划船','Dumbbell Bicep Curl':'哑铃弯举','Barbell Bench Press - Medium Grip':'杠铃平板卧推','Dumbbell Bench Press':'哑铃平板卧推','Incline Dumbbell Press':'上斜哑铃卧推','Pushups':'俯卧撑','Pullups':'引体向上','Chin-Up':'反握引体向上','Barbell Squat':'杠铃深蹲','Barbell Deadlift':'杠铃硬拉','Romanian Deadlift':'罗马尼亚硬拉','Leg Press':'腿举','Leg Extensions':'坐姿腿屈伸','Lying Leg Curls':'俯卧腿弯举','Seated Leg Curl':'坐姿腿弯举','Standing Calf Raises':'站姿提踵','Seated Calf Raise':'坐姿提踵','Dumbbell Shoulder Press':'哑铃肩推','Side Lateral Raise':'哑铃侧平举','Front Dumbbell Raise':'哑铃前平举','Face Pull':'绳索面拉','Triceps Pushdown':'绳索下压','Triceps Pushdown - Rope Attachment':'绳索三头下压','Barbell Curl':'杠铃弯举','Hammer Curls':'锤式弯举','Plank':'平板支撑','Crunches':'卷腹','Sit-Up':'仰卧起坐','Hanging Leg Raise':'悬垂举腿','Russian Twist':'俄罗斯转体','Dips - Triceps Version':'双杠臂屈伸','Dumbbell Lunges':'哑铃弓步蹲','Walking, Treadmill':'跑步机步行','Running, Treadmill':'跑步机跑步','Rope Jumping':'跳绳','Burpee':'波比跳','Mountain Climbers':'登山跑','Hip Thrust':'臀推','Glute Bridge':'臀桥','Air Bike':'仰卧交替蹬车','Bicycling, Stationary':'固定自行车','Rowing, Stationary':'划船机','Elliptical Trainer':'椭圆机','Stairmaster':'登阶机','Dumbbell Flyes':'哑铃飞鸟','Cable Crossover':'绳索夹胸','Bent Over Barbell Row':'杠铃俯身划船','T-Bar Row with Handle':'T杠划船','Straight-Arm Pulldown':'直臂下压','Incline Dumbbell Curl':'上斜哑铃弯举','Concentration Curls':'集中弯举','Preacher Curl':'牧师凳弯举','Dumbbell Shrug':'哑铃耸肩','Barbell Shrug':'杠铃耸肩','Goblet Squat':'高脚杯深蹲','Front Barbell Squat':'杠铃前蹲','Hack Squat':'哈克深蹲','Bulgarian Split Squat':'保加利亚分腿蹲','Dumbbell Step Ups':'哑铃上台阶','Good Morning':'杠铃早安式','Hyperextensions (Back Extensions)':'背部伸展','Superman':'超人式','Ab Roller':'健腹轮','Reverse Crunch':'反向卷腹','Cable Crunch':'绳索卷腹','Dumbbell Pullover':'哑铃仰卧上拉'}
out=[]
dest=root/'src/renderer/public/fitness/exercises';dest.mkdir(parents=True,exist_ok=True)
for x in data:
    primary=[muscles[m] for m in x['primaryMuscles']];secondary=[muscles[m] for m in x['secondaryMuscles']]
    images=[]
    for i,p in enumerate(x['images']):
        target=dest/(x['id']+'-'+str(i)+'.jpg');shutil.copyfile(source/'exercises'/p,target);images.append('fitness/exercises/'+target.name)
    if not images:
        images=['fitness/kettlebell.png']
    category=x['category'];part='有氧' if category=='cardio' else parts[x['primaryMuscles'][0]]
    out.append(dict(id=x['id'],name=names.get(x['name'],x['name']),alias=x['name'],part=part,muscles=primary,secondary=secondary,equipment=equipment[x['equipment']],measure='time' if category in ['cardio','stretching'] or x['name']=='Plank' else 'weight',description='主要锻炼'+('、'.join(primary))+'。'+('辅助参与：'+'、'.join(secondary)+'。' if secondary else ''),notes='',image=images[0],images=images,favorite=False,tags=[{'strength':'力量','stretching':'拉伸','cardio':'有氧','plyometrics':'爆发力','powerlifting':'力量举','olympic weightlifting':'举重','strongman':'大力士'}.get(category,category)]))
(root/'src/renderer/src/fitness/catalog.json').write_text(json.dumps(out,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
shutil.copyfile(source/'LICENSE.md',root/'src/renderer/public/fitness/EXERCISE-LICENSE.txt')
(root/'src/renderer/public/fitness/SOURCES.md').write_text('动作资料及示范图片： https://github.com/yuhonas/free-exercise-db\n许可：Unlicense。中文名称与肌肉简介由本项目整理。\n',encoding='utf-8')
print(f'{len(out)} exercises, {sum(len(x["images"]) for x in out)} images')
