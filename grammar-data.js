/* ==========================================================================
   顺势 · 30 天语法小营
   以《语法透析手册》的“五大句型 + 八大成分 + 场景句”为骨架，
   参考《英语阅读参考手册》的“先判别、再理解”思路，重写原创例句。
   每天：一句场景句 + 一条规则 + 3 道练习 + 1 次输出 + 1 道隔日复习。
   ========================================================================== */
(function () {
  'use strict';

  const UNITS = [
    { id: 'frame', name: '句子骨架', range: [1, 7], color: '#d96e51', note: '先找谁 + 做什么，再往句子里加东西。' },
    { id: 'verb', name: '谓语动词', range: [8, 14], color: '#b07f39', note: '一个简单句一个谓语；时态、语态、主谓一致都围着它转。' },
    { id: 'noun', name: '名词与修饰', range: [15, 21], color: '#3d8f9c', note: '把名词说清楚：冠词、复数、形容词、介词短语、定语从句。' },
    { id: 'clause', name: '从句与非谓语', range: [22, 30], color: '#8a74b8', note: '长句不可怕：先剥修饰，再找主干。' }
  ];

  const RAW = [
    {
      title: '谁 + 做了什么',
      subtitle: '先找动作，再找动作的主人',
      scene: '深夜，浅海侦探社的灯亮了。小潮推门进来。',
      sentence: 'Xiaochao arrived.',
      translation: '小潮到了。',
      tokens: [['Xiaochao', '主语'], ['arrived', '谓语']],
      rule: '英语句子的最小骨架是“主语 + 谓语”。主语是动作的发出者，谓语说明它做什么、怎么样。',
      tip: '先找谓语动词 arrived，再问“谁 arrived？”——答案就是主语。',
      questions: [
        ['这句话的主语是谁？', ['Xiaochao', 'arrived', 'the door'], 0, 'arrived 是动作，发出动作的是 Xiaochao。'],
        ['arrived 在句子里充当什么？', ['主语', '谓语', '宾语'], 1, 'arrived 说明主语做了什么，是谓语。'],
        ['下面哪一句也是“主语 + 谓语”？', ['The rain stopped.', 'She found a key.', 'The box was empty.'], 0, 'The rain stopped. 只有主语和谓语；第二句有宾语，第三句有表语。']
      ],
      output: {
        prompt: '用“谁 + 做了什么”写一句今天发生的事。',
        sample: 'The bus stopped.'
      }
    },
    {
      title: '谁 + 做了什么 + 什么',
      subtitle: '宾语让动作有了着落',
      scene: '桌上放着一个旧盒子。小潮打开了它。',
      sentence: 'Xiaochao opened the box.',
      translation: '小潮打开了盒子。',
      tokens: [['Xiaochao', '主语'], ['opened', '谓语'], ['the box', '宾语']],
      rule: '谓语后面承受动作的人或物，叫宾语。SVO = 谁 + 做什么 + 什么。',
      tip: '问“opened 了什么？”——the box 就是宾语。',
      questions: [
        ['这句话的宾语是什么？', ['Xiaochao', 'opened', 'the box'], 2, 'opened 的对象是 the box。'],
        ['这句话属于哪种句型？', ['主语 + 谓语', '主语 + 谓语 + 宾语', '主语 + 系动词 + 表语'], 1, '主语 Xiaochao + 谓语 opened + 宾语 the box。'],
        ['下面哪一句是“主语 + 谓语 + 宾语”？', ['The door opened.', 'Xiaochao found a key.', 'The box was empty.'], 1, 'found 后面有宾语 a key；第一句没有宾语，第三句是主系表。']
      ],
      output: {
        prompt: '写一句“谁 + 做了什么 + 什么”。',
        sample: 'I lost my key.'
      }
    },
    {
      title: '给谁 + 什么',
      subtitle: '双宾语：先给谁，再给什么',
      scene: '星尾在门外发来一条消息。小潮的手机响了。',
      sentence: 'Xingwei sent Xiaochao a message.',
      translation: '星尾给小潮发了一条消息。',
      tokens: [['Xingwei', '主语'], ['sent', '谓语'], ['Xiaochao', '间接宾语'], ['a message', '直接宾语']],
      rule: '有些动词后面跟两个宾语：先“给谁”，再“给什么”。这叫双宾语。',
      tip: '把“给谁”放到后面时，常加 to 或 for：sent a message to Xiaochao。',
      questions: [
        ['谁是间接宾语？', ['Xingwei', 'Xiaochao', 'a message'], 1, 'Xiaochao 是“给谁”，a message 是“给什么”。'],
        ['谁是直接宾语？', ['Xiaochao', 'a message', 'sent'], 1, 'a message 是动作直接涉及的东西。'],
        ['哪一句和原句意思相同？', ['Xingwei sent a message to Xiaochao.', 'Xingwei sent Xiaochao to a message.', 'Xingwei sent a message for Xiaochao.'], 0, '双宾语改成 to 结构，意思不变；for 会变成“替谁发”。']
      ],
      output: {
        prompt: '写一句“谁给谁什么”。',
        sample: 'My mother gave me a book.'
      }
    },
    {
      title: '让宾语怎么样',
      subtitle: '宾语补足语：把话补完整',
      scene: '消息说盒子是空的。这个消息让小潮很紧张。',
      sentence: 'The news made Xiaochao nervous.',
      translation: '这个消息让小潮很紧张。',
      tokens: [['The news', '主语'], ['made', '谓语'], ['Xiaochao', '宾语'], ['nervous', '宾语补足语']],
      rule: '有些动词（make, keep, find, call）后面要再补一笔，说明宾语“怎么样”，这就是宾语补足语。',
      tip: '中文说“让小潮紧张”，英语把 nervous 放在宾语后面；不要漏掉它。',
      questions: [
        ['这句话的宾语是谁？', ['The news', 'Xiaochao', 'nervous'], 1, 'made 的对象是 Xiaochao。'],
        ['nervous 的作用是什么？', ['宾语', '宾语补足语', '表语'], 1, 'nervous 补充说明宾语 Xiaochao 的状态。'],
        ['哪一句是“主语 + 谓语 + 宾语 + 宾补”？', ['The box was empty.', 'The news made Xiaochao nervous.', 'Xiaochao opened the box.'], 1, 'made + 宾语 Xiaochao + 宾补 nervous。']
      ],
      output: {
        prompt: '用 make + 宾语 + 形容词写一句。',
        sample: 'The music made me happy.'
      }
    },
    {
      title: '谁 + 是/变得 + 什么',
      subtitle: '系动词像等号，后面是表语',
      scene: '盒子真的是空的。小潮觉得这件事很奇怪。',
      sentence: 'The box was empty.',
      translation: '盒子是空的。',
      tokens: [['The box', '主语'], ['was', '系动词'], ['empty', '表语']],
      rule: '系动词（be, look, become, feel）像等号，后面的成分说明主语“是什么、怎么样”，叫表语。',
      tip: '表语不是宾语：empty 说明 The box 的状态，不是 was 的动作对象。',
      questions: [
        ['这句话的系动词是哪个？', ['The box', 'was', 'empty'], 1, 'was 在这里不表示具体动作，只连接主语和表语。'],
        ['这句话的表语是哪个？', ['The box', 'was', 'empty'], 2, 'empty 说明主语 The box 的状态。'],
        ['哪一句是“主语 + 系动词 + 表语”？', ['The box was empty.', 'Xiaochao opened the box.', 'Xingwei sent a message.'], 0, 'was + empty 构成主系表；另外两句都有宾语。']
      ],
      output: {
        prompt: '用“主语 + 系动词 + 表语”写一句。',
        sample: 'The room is quiet.'
      }
    },
    {
      title: '先抓主干，再剥状语',
      subtitle: '地点、时间可以拿走，主干还在',
      scene: '团队在盒子里找到一条线索。线索藏得很深。',
      sentence: 'The team found a clue in the box.',
      translation: '团队在盒子里找到了一条线索。',
      tokens: [['The team', '主语'], ['found', '谓语'], ['a clue', '宾语'], ['in the box', '状语']],
      rule: '先抓主干“谁 + 做什么 + 什么”，再看时间、地点等状语。状语可以拿走，句子主干还在。',
      tip: 'in the box 是地点状语，不是宾语；found 的宾语只有 a clue。',
      questions: [
        ['这句话的主干属于哪种句型？', ['主语 + 谓语', '主语 + 谓语 + 宾语', '主语 + 谓语 + 宾语 + 宾补'], 1, '主干是 The team found a clue。'],
        ['in the box 是什么成分？', ['宾语', '状语', '表语'], 1, '它说明“在哪儿找到”，是地点状语。'],
        ['去掉 in the box 后，句子会怎样？', ['仍然完整', '没有谓语', '变成被动句'], 0, 'The team found a clue. 主干仍然完整。']
      ],
      output: {
        prompt: '写一句“谁 + 做了什么 + 什么”，再加一个地点状语。',
        sample: 'I found a key under the desk.'
      }
    },
    {
      title: '一周挑战：给句子搭骨架',
      subtitle: '把五大句型放在一起辨一辨',
      scene: '空盒子不说话，却告诉团队一个秘密：盒子底部有夹层。',
      sentence: 'The empty box told the team a secret.',
      translation: '这个空盒子告诉团队一个秘密。',
      tokens: [['The empty box', '主语'], ['told', '谓语'], ['the team', '间接宾语'], ['a secret', '直接宾语']],
      rule: '双宾语常跟 give, send, tell, show, teach, buy 等动词。先给谁，再给什么。',
      tip: '改成 to 结构：told a secret to the team。意思不变。',
      questions: [
        ['这句话属于哪种句型？', ['主语 + 谓语 + 宾语', '主语 + 谓语 + 双宾语', '主语 + 谓语 + 宾语 + 宾补'], 1, 'told 后面有 the team 和 a secret 两个宾语。'],
        ['the team 是什么宾语？', ['直接宾语', '间接宾语', '宾语补足语'], 1, 'the team 是“告诉谁”，是间接宾语。'],
        ['哪一句改写正确？', ['The box told a secret to the team.', 'The box told the team to a secret.', 'The box told a secret for the team.'], 0, '双宾语改 to 结构：动词 + 直接宾语 + to + 间接宾语。']
      ],
      output: {
        prompt: '用 tell / show / give 写一句双宾语。',
        sample: 'She showed me her new book.'
      }
    },
    {
      title: '一个句子，一个谓语',
      subtitle: '谓语和非谓语别打架',
      scene: '小潮想打开盒子，可盒子锁住了。',
      sentence: 'Xiaochao wants to open the box.',
      translation: '小潮想打开盒子。',
      tokens: [['Xiaochao', '主语'], ['wants', '谓语'], ['to open the box', '非谓语']],
      rule: '一个简单句只能有一个谓语动词。wants 是谓语；to open 是非谓语，不能再当谓语。',
      tip: '看到两个动词，先找带时态的那个；另一个常是 to do / doing / done。',
      questions: [
        ['这句话的谓语是哪个？', ['Xiaochao', 'wants', 'to open'], 1, 'wants 带第三人称单数形式，是谓语。'],
        ['to open 是什么？', ['谓语', '非谓语', '宾语补足语'], 1, 'to open 是不定式，作 wants 的宾语，不再作谓语。'],
        ['哪一句只有一个谓语？', ['She wants to help.', 'She wants to help and opens the box.', 'She wants opens the box.'], 0, '第二句有两个谓语 wants 和 opens；第三句动词形式错误。']
      ],
      output: {
        prompt: '用 want to do 写一句。',
        sample: 'I want to learn grammar.'
      }
    },
    {
      title: '习惯用现在，过去用过去',
      subtitle: '先看时间，再定时态',
      scene: '星尾每晚都检查门锁。昨晚她却忘了。',
      sentence: 'Xingwei checks the door every night, but she forgot last night.',
      translation: '星尾每晚检查门，但昨晚她忘了。',
      tokens: [['Xingwei', '主语'], ['checks', '谓语'], ['the door', '宾语'], ['every night', '时间状语'], ['but', '连词'], ['she', '主语'], ['forgot', '谓语'], ['last night', '时间状语']],
      rule: '一般现在时表示习惯、事实；一般过去时表示过去某个时间发生的事。',
      tip: 'every night 提示习惯，用 checks；last night 提示过去，用 forgot。',
      questions: [
        ['every night 提示用什么时态？', ['一般现在时', '一般过去时', '现在完成时'], 0, 'every night 表示反复发生的习惯。'],
        ['last night 提示用什么时态？', ['一般现在时', '一般过去时', '现在完成时'], 1, 'last night 是明确的过去时间。'],
        ['哪一句正确？', ['She checks the door last night.', 'She checked the door last night.', 'She check the door last night.'], 1, 'last night 用过去式 checked。']
      ],
      output: {
        prompt: '写两句：一个习惯，一个昨晚的事。',
        sample: 'I read every night. I read a comic last night.'
      }
    },
    {
      title: '此刻正在做',
      subtitle: 'be + doing 的现在进行时',
      scene: '现在，团队正在搜查房间。云鲸在找桌子下面。',
      sentence: 'The team is searching the room now.',
      translation: '团队现在正在搜查房间。',
      tokens: [['The team', '主语'], ['is searching', '谓语'], ['the room', '宾语'], ['now', '时间状语']],
      rule: '现在进行时 = be（am/is/are）+ doing，表示此刻正在进行。',
      tip: '看到 now, look, listen，常考虑进行时；但不要只靠时间词，要看动作是否“正在进行”。',
      questions: [
        ['现在进行时的结构是？', ['do / does', 'be + doing', 'have + done'], 1, 'be 随主语变化，后面接动词 -ing。'],
        ['now 说明动作怎样？', ['经常发生', '此刻正在发生', '已经完成'], 1, 'now 表示此时此刻。'],
        ['哪一句正确？', ['They is searching.', 'They are searching.', 'They searching.'], 1, '主语 They 用 are，后面接 searching。']
      ],
      output: {
        prompt: '写一句“某人正在做某事”。',
        sample: 'My sister is reading.'
      }
    },
    {
      title: '从过去走到现在',
      subtitle: 'have/has + done 的现在完成时',
      scene: '从早上到现在，团队已经找到三条线索。',
      sentence: 'They have found three clues since morning.',
      translation: '从早上到现在，他们已经找到了三条线索。',
      tokens: [['They', '主语'], ['have found', '谓语'], ['three clues', '宾语'], ['since morning', '时间状语']],
      rule: '现在完成时 = have/has + 过去分词，表示过去发生、对现在有影响，或从过去持续到现在。',
      tip: 'since + 时间点，for + 一段时间；这句强调“到现在已经找到”。',
      questions: [
        ['现在完成时的结构是？', ['have + done', 'be + doing', 'will + do'], 0, 'have/has 后面接过去分词。'],
        ['since morning 表示什么？', ['从早上到现在', '昨晚', '明天'], 0, 'since 后面接时间点，表示从那时持续到现在。'],
        ['哪一句正确？', ['They have found three clues.', 'They have find three clues.', 'They has found three clues.'], 0, '主语 They 用 have，find 的过去分词是 found。']
      ],
      output: {
        prompt: '写一句“今天已经做完的事”。',
        sample: 'I have finished my homework.'
      }
    },
    {
      title: '主语被怎么样了',
      subtitle: 'be + done 的被动语态',
      scene: '珍珠不在桌上。它被人藏在桌子下面。',
      sentence: 'The pearl was hidden under the desk.',
      translation: '珍珠被藏在桌子下面。',
      tokens: [['The pearl', '主语'], ['was hidden', '谓语/被动'], ['under the desk', '状语']],
      rule: '被动语态 = be + 过去分词，表示主语“被……”；动作是谁做的，可以说也可以不说。',
      tip: '主动句 Someone hid the pearl under the desk. 改成被动，宾语 the pearl 提到句首。',
      questions: [
        ['被动语态的结构是？', ['be + done', 'have + done', 'be + doing'], 0, 'be 随时间和主语变化，后面接过去分词。'],
        ['这句话有没有说是谁藏了珍珠？', ['没有说', '是珍珠自己', '是桌子'], 0, '被动句省略了动作发出者，重点在“珍珠被藏”。'],
        ['哪一句是被动语态？', ['The pearl was hidden under the desk.', 'The pearl hid under the desk.', 'The pearl is hiding under the desk.'], 0, 'was hidden 是 be + 过去分词。']
      ],
      output: {
        prompt: '写一句“某物被放在某处”。',
        sample: 'The key was placed on the table.'
      }
    },
    {
      title: '真正的主语是谁',
      subtitle: '主谓一致：别被 of 后面的词带跑',
      scene: '桌上有一盒旧照片。盒子本身在桌子中间。',
      sentence: 'The box of old photos is on the desk.',
      translation: '那盒旧照片在桌上。',
      tokens: [['The box of old photos', '主语'], ['is', '谓语'], ['on the desk', '状语']],
      rule: '主语和谓语要一致。真正的主语是 box，不是 photos；of old photos 只是修饰 box。',
      tip: '遇到“A of B”，先问“这句话在说谁？”——在说 the box，所以用 is。',
      questions: [
        ['这句话真正的主语是？', ['the box', 'old photos', 'the desk'], 0, 'of old photos 修饰 the box，中心词是 box。'],
        ['谓语应该用哪个？', ['is', 'are', 'were'], 0, '中心词 box 是单数，用 is。'],
        ['哪一句正确？', ['The box of photos are on the desk.', 'The box of photos is on the desk.', 'The box of photos be on the desk.'], 1, '主语中心词是 box，单数，用 is。']
      ],
      output: {
        prompt: '写一句“一盒/一袋……在……”。',
        sample: 'The bag of apples is in the kitchen.'
      }
    },
    {
      title: '两周挑战：时态、语态一起看',
      subtitle: '先看时间线，再看主语和动作的关系',
      scene: '团队已经工作了两个小时。现在，房间正在被清理。',
      sentence: 'The team has worked for two hours, and the room is being cleaned now.',
      translation: '团队已经工作了两个小时，房间现在正在被清理。',
      tokens: [['The team', '主语'], ['has worked', '谓语/完成时'], ['for two hours', '时间状语'], ['and', '连词'], ['the room', '主语'], ['is being cleaned', '谓语/被动进行'], ['now', '时间状语']],
      rule: '同一句里可以有两个分句，但每个分句各有一个谓语。先看时间线，再定时态；看主语和动作的关系，定主动或被动。',
      tip: 'for + 一段时间；is being cleaned 是“正在被清理”。',
      questions: [
        ['has worked 是什么时态？', ['现在完成时', '一般过去时', '过去进行时'], 0, 'has + 过去分词，表示从过去持续到现在。'],
        ['is being cleaned 是什么？', ['主动进行', '被动进行', '完成时'], 1, 'is being + 过去分词，表示“正在被……”。'],
        ['哪一句正确？', ['The room is cleaning now.', 'The room is being cleaned now.', 'The room has cleaning now.'], 1, '房间是“被清理”，用被动进行时。']
      ],
      output: {
        prompt: '写两句：一句完成时，一句被动。',
        sample: 'I have finished my work. The window was cleaned.'
      }
    },
    {
      title: '第一次用 a，再次用 the',
      subtitle: '冠词不是装饰，是“新信息/旧信息”的路标',
      scene: '一把小钥匙从盒子里掉了出来。钥匙是铜色的。',
      sentence: 'A small key fell out of the box. The key was made of copper.',
      translation: '一把小钥匙从盒子里掉了出来。这把钥匙是铜做的。',
      tokens: [['A small key', '主语'], ['fell', '谓语'], ['out of the box', '状语'], ['The key', '主语'], ['was made', '谓语/被动'], ['of copper', '状语']],
      rule: '第一次提到某个东西，常用 a/an；再次提到同一个东西，用 the。',
      tip: '第一句 a small key 是“新信息”；第二句 the key 是“刚才那把”。',
      questions: [
        ['第一次提到钥匙，用哪个？', ['a', 'the', '不加冠词'], 0, '第一次出现，听话人还不知道是哪一把，用 a。'],
        ['再次提到同一把钥匙，用哪个？', ['a', 'the', 'an'], 1, '第二次提到，双方都知道是哪一把，用 the。'],
        ['哪一句正确？', ['A key fell out. The key was old.', 'The key fell out. A key was old.', 'A key fell out. A key was old.'], 0, '第一句用 a 引入，第二句用 the 回指。']
      ],
      output: {
        prompt: '写两句：第一次用 a/an，第二次用 the。',
        sample: 'A cat sat on the wall. The cat was black.'
      }
    },
    {
      title: '谁的什么东西',
      subtitle: '复数所有格和单数所有格',
      scene: '侦探们的笔记放在队长桌上。队长的桌子很乱。',
      sentence: "The detectives' notes are on the captain's desk.",
      translation: '侦探们的笔记在队长的桌上。',
      tokens: [["The detectives' notes", '主语'], ['are', '谓语'], ["on the captain's desk", '状语']],
      rule: '复数名词所有格一般加 ’；单数名词所有格加 ’s。先说“谁的”，再说“东西”。',
      tip: "detectives' = 侦探们的；captain's = 队长的。注意撇号位置。",
      questions: [
        ["detectives' 的意思是什么？", ['一个侦探的', '侦探们的', '侦探们'], 1, '以 s 结尾的复数名词，所有格只加撇号。'],
        ["captain's desk 是什么意思？", ['队长的桌子', '队长在桌子上', '桌子有队长'], 0, "captain's 表示“队长的”。"],
        ['哪一句正确？', ["The captain's desk is clean.", 'The captains desk is clean.', "The captain desk's is clean."], 0, '单数名词所有格加 ’s。']
      ],
      output: {
        prompt: '写一句“谁的什么东西在哪儿”。',
        sample: "My brother's book is on the shelf."
      }
    },
    {
      title: '形容词修饰名词，副词修饰动作',
      subtitle: '看它旁边是谁，就知道它在干什么',
      scene: '小潮仔细搜查房间。他是一只很小的水獭。',
      sentence: 'The little otter searched the room carefully.',
      translation: '这只小水獭仔细地搜查了房间。',
      tokens: [['The little otter', '主语'], ['searched', '谓语'], ['the room', '宾语'], ['carefully', '状语']],
      rule: '形容词修饰名词（little otter）；副词修饰动词（searched carefully）。',
      tip: 'little 放在名词前；carefully 放在动词后。中文“仔细地”有“地”，英语常是 -ly 副词。',
      questions: [
        ['little 修饰哪个词？', ['otter', 'searched', 'room'], 0, 'little 放在名词 otter 前，说明“小”。'],
        ['carefully 修饰哪个词？', ['otter', 'searched', 'room'], 1, 'carefully 说明“怎么搜查”，修饰动词 searched。'],
        ['哪一句正确？', ['He searched careful.', 'He searched carefully.', 'He carefully searched the room careful.'], 1, '修饰动词用副词 carefully。']
      ],
      output: {
        prompt: '写一句“某人认真地做某事”。',
        sample: 'She listened carefully.'
      }
    },
    {
      title: '两者比较，三者比最',
      subtitle: '比较级和最高级',
      scene: '第一条线索有点用。最后一条线索最有用。',
      sentence: 'This clue is more useful than the first one, but the last clue is the most useful.',
      translation: '这条线索比第一条更有用，但最后一条线索最有用。',
      tokens: [['This clue', '主语'], ['is', '系动词'], ['more useful', '表语'], ['than the first one', '比较状语'], ['but', '连词'], ['the last clue', '主语'], ['is', '系动词'], ['the most useful', '表语']],
      rule: '两者比较用比较级（more useful / -er）；三者及以上比“最”，用最高级（the most useful / -est）。',
      tip: '长形容词加 more/most，短形容词加 -er/-est；最高级前通常加 the。',
      questions: [
        ['more useful 是什么级？', ['比较级', '最高级', '原级'], 0, '两者比较，用比较级。'],
        ['the most useful 是什么级？', ['比较级', '最高级', '原级'], 1, '三者及以上比“最”，用最高级。'],
        ['哪一句正确？', ['This book is more interesting.', 'This book is most interesting than that one.', 'This book is more interesting than that one.'], 2, '两者比较用 more interesting than。']
      ],
      output: {
        prompt: '比较两个东西，再用最高级说一个。',
        sample: 'My bike is faster than yours. This is the fastest bike.'
      }
    },
    {
      title: '介词短语：放前还是放后',
      subtitle: '先找主干，再剥介词短语',
      scene: '灯下有一把钥匙。星尾在灯下找到了它。',
      sentence: 'The key under the lamp was found by Xingwei.',
      translation: '灯下的那把钥匙被星尾找到了。',
      tokens: [['The key under the lamp', '主语'], ['was found', '谓语/被动'], ['by Xingwei', '状语']],
      rule: '介词短语可以放在名词后作定语（under the lamp 修饰 key），也可以放在句末作状语（by Xingwei 说明谁找到的）。',
      tip: '先找主干 The key was found，再把 under the lamp 和 by Xingwei 剥掉。',
      questions: [
        ['under the lamp 修饰哪个词？', ['key', 'found', 'Xingwei'], 0, '它说明“哪把钥匙”，修饰 key。'],
        ['by Xingwei 说明什么？', ['钥匙的位置', '谁找到的', '什么时候'], 1, 'by + 人 在被动句里说明动作发出者。'],
        ['这句话的主干是什么？', ['The key was found.', 'The key under the lamp.', 'Xingwei found the lamp.'], 0, '去掉介词短语后，主干是 The key was found。']
      ],
      output: {
        prompt: '写一句“某物在某个位置被某人……”。',
        sample: 'The ball under the chair was found by Tom.'
      }
    },
    {
      title: '哪一个？定语从句来限定',
      subtitle: 'who / which / that 把名词说具体',
      scene: '打开盒子的那只水獭找到了一张地图。',
      sentence: 'The otter who opened the box found a map.',
      translation: '打开盒子的那只水獭找到了一张地图。',
      tokens: [['The otter', '主语/先行词'], ['who opened the box', '定语从句'], ['found', '谓语'], ['a map', '宾语']],
      rule: '定语从句跟在名词后面，说明“哪一个”。who 指人，which 指物，that 都可以。',
      tip: '先找主句 The otter found a map；who opened the box 只是修饰 otter。',
      questions: [
        ['who 指谁？', ['the otter', 'the box', 'the map'], 0, 'who 指人，先行词是 the otter。'],
        ['who opened the box 修饰哪个词？', ['otter', 'found', 'map'], 0, '定语从句修饰前面的名词 the otter。'],
        ['哪一句正确？', ['The girl who sings is my sister.', 'The girl who sing is my sister.', 'The girl which sings is my sister.'], 0, '先行词 the girl 是单数，从句谓语用 sings；指人用 who。']
      ],
      output: {
        prompt: '用 who 写一句“做某事的人”。',
        sample: 'The boy who helped me is my friend.'
      }
    },
    {
      title: '三周挑战：长名词短语',
      subtitle: '先剥定语，再找主谓宾',
      scene: '小潮在灯下找到的地图，把团队带到了一座小岛。',
      sentence: 'The map that Xiaochao found under the lamp led the team to a small island.',
      translation: '小潮在灯下找到的那张地图，把团队带到了一座小岛。',
      tokens: [['The map', '主语/先行词'], ['that Xiaochao found under the lamp', '定语从句'], ['led', '谓语'], ['the team', '宾语'], ['to a small island', '状语']],
      rule: '长定语放在名词后面。先剥掉定语从句，再找主句的主谓宾。',
      tip: '主句是 The map led the team to a small island；that... 只是说明哪张地图。',
      questions: [
        ['主句的谓语是哪个？', ['found', 'led', 'took'], 1, '主句是 The map led...；found 在定语从句里。'],
        ['that 从句修饰哪个词？', ['map', 'Xiaochao', 'team'], 0, 'that 指代先行词 the map。'],
        ['这句话的主干是什么？', ['The map led the team to a small island.', 'Xiaochao found the map.', 'The map found the team.'], 0, '去掉 that 从句后，主干是 The map led the team to a small island。']
      ],
      output: {
        prompt: '写一句“某人找到/喜欢的某物……”。',
        sample: 'The book that I bought yesterday is interesting.'
      }
    },
    {
      title: '他说了什么',
      subtitle: '宾语从句用陈述语序',
      scene: '星尾说，珍珠在小岛上。',
      sentence: 'Xingwei said that the pearl was on the island.',
      translation: '星尾说珍珠在小岛上。',
      tokens: [['Xingwei', '主语'], ['said', '谓语'], ['that the pearl was on the island', '宾语从句']],
      rule: '宾语从句用陈述语序：引导词 + 主语 + 谓语。that 在口语中常可省略。',
      tip: '不要说 said that was the pearl...；从句里主语 the pearl 在谓语 was 前面。',
      questions: [
        ['that 从句在句子里作什么？', ['宾语', '主语', '表语'], 0, 'said 的宾语是整段 that 从句。'],
        ['从句的语序应该是？', ['the pearl was', 'was the pearl', 'the pearl is was'], 0, '宾语从句用陈述语序，主语在谓语前。'],
        ['哪一句正确？', ['She said that she was tired.', 'She said that was she tired.', 'She said did she was tired.'], 0, 'that 从句用陈述语序 she was tired。']
      ],
      output: {
        prompt: '用 said that 转述一句话。',
        sample: 'He said that he was busy.'
      }
    },
    {
      title: '用 it 占个位置',
      subtitle: '形式主语和真正主语',
      scene: '盒子是空的，这很奇怪。',
      sentence: 'It is strange that the box was empty.',
      translation: '盒子是空的，这很奇怪。',
      tokens: [['It', '形式主语'], ['is', '谓语'], ['strange', '表语'], ['that the box was empty', '真正主语']],
      rule: '主语从句太长时，常用 it 占位，把真正的主语放到后面：It is + 形容词 + that...',
      tip: 'it 本身不指具体东西，只是“形式主语”；真正内容是 that 从句。',
      questions: [
        ['it 的作用是什么？', ['形式主语', '宾语', '表语'], 0, 'it 占主语位置，真正的主语在后面。'],
        ['真正的主语是哪部分？', ['it', 'strange', 'that the box was empty'], 2, 'that 从句才是“奇怪”的内容。'],
        ['哪一句正确？', ['It is important that we practice daily.', 'It is important that do we practice daily.', 'It important that we practice daily.'], 0, 'It is + 形容词 + that + 陈述语序。']
      ],
      output: {
        prompt: '用 It is + 形容词 + that... 写一句。',
        sample: 'It is important that we help each other.'
      }
    },
    {
      title: '问题是什么',
      subtitle: '表语从句解释主语的内容',
      scene: '问题是：没有人看见小偷。',
      sentence: 'The problem is that nobody saw the thief.',
      translation: '问题是没有人看见小偷。',
      tokens: [['The problem', '主语'], ['is', '系动词'], ['that nobody saw the thief', '表语从句']],
      rule: '系动词后面的从句叫表语从句，说明主语“是什么”。常见引导词：that, whether, because。',
      tip: '先看到 is，再看到 that 从句；从句解释 The problem 的内容。',
      questions: [
        ['that 从句在句子里作什么？', ['表语', '宾语', '主语'], 0, 'is 后面解释主语内容的从句是表语从句。'],
        ['这句话的主语是哪个？', ['The problem', 'nobody', 'the thief'], 0, 'The problem 是主句主语；nobody 在从句里。'],
        ['哪一句正确？', ['The reason is that he was late.', 'The reason is because he was late.', 'The reason is that was he late.'], 0, 'The reason is that... 是标准表达；从句用陈述语序。']
      ],
      output: {
        prompt: '用 The reason is that... 写一句。',
        sample: 'The reason is that I missed the bus.'
      }
    },
    {
      title: '什么时候，就怎么样',
      subtitle: '时间状语从句与过去完成时',
      scene: '团队到达小岛时，太阳已经落山了。',
      sentence: 'When the team reached the island, the sun had set.',
      translation: '团队到达小岛时，太阳已经落山了。',
      tokens: [['When the team reached the island', '时间状语从句'], ['the sun', '主语'], ['had set', '谓语/过去完成时']],
      rule: '时间/条件状语从句用一般现在时表示将来；过去的事情里，“更早发生”的动作可用过去完成时。',
      tip: 'when 从句说明时间；主句 the sun had set 表示在到达之前已经落山。',
      questions: [
        ['when 从句是什么从句？', ['时间状语从句', '宾语从句', '定语从句'], 0, 'when 说明主句动作发生的时间。'],
        ['had set 表示哪个动作更早？', ['太阳落山更早', '团队到达更早', '两个同时'], 0, '过去完成时表示“过去的过去”。'],
        ['哪一句正确？', ['When I arrive tomorrow, I will call you.', 'When I will arrive tomorrow, I call you.', 'When I arrived tomorrow, I will call you.'], 0, '时间状语从句用一般现在时表示将来。']
      ],
      output: {
        prompt: '用 When..., ... 写一句。',
        sample: 'When I got home, my mother had cooked dinner.'
      }
    },
    {
      title: '虽然……但是……',
      subtitle: '让步和原因，英语只留一个连接词',
      scene: '路很黑，但他们继续走，因为珍珠就在附近。',
      sentence: 'Although the path was dark, they kept walking because the pearl was close.',
      translation: '虽然路很黑，但他们继续走，因为珍珠就在附近。',
      tokens: [['Although the path was dark', '让步状语从句'], ['they', '主语'], ['kept walking', '谓语'], ['because the pearl was close', '原因状语从句']],
      rule: 'although/though 表示“虽然”，because 表示“因为”。英语里 although 和 but 不同时用，because 和 so 不同时用。',
      tip: '中文“虽然……但是……”，英语只留一个连接词：Although..., they...',
      questions: [
        ['Although 从句表示什么？', ['原因', '让步', '时间'], 1, 'although 表示“虽然、尽管”，是让步。'],
        ['because 从句表示什么？', ['原因', '让步', '结果'], 0, 'because 说明原因。'],
        ['哪一句正确？', ['Although it rained, they went out.', 'Although it rained, but they went out.', 'Because it rained, so they went out.'], 0, 'although 和 but 不同时用；because 和 so 不同时用。']
      ],
      output: {
        prompt: '用 Although..., ... 写一句。',
        sample: 'Although I was tired, I finished my homework.'
      }
    },
    {
      title: '一边走，一边听',
      subtitle: '-ing 短语作状语',
      scene: '沿着海滩走时，小潮听到一个奇怪的声音。',
      sentence: 'Walking along the beach, Xiaochao heard a strange sound.',
      translation: '沿着海滩走时，小潮听到一个奇怪的声音。',
      tokens: [['Walking along the beach', '非谓语/状语'], ['Xiaochao', '主语'], ['heard', '谓语'], ['a strange sound', '宾语']],
      rule: '-ing 短语可以作状语，表示主动、正在进行的动作。它的逻辑主语通常就是主句主语。',
      tip: 'Walking 的主语是 Xiaochao，不是 sound；主语要能“主动走”。',
      questions: [
        ['Walking 的逻辑主语是谁？', ['Xiaochao', 'sound', 'beach'], 0, '是 Xiaochao 在走，主句主语要能发出 walking 的动作。'],
        ['Walking 表示什么？', ['主动/进行', '被动/完成', '目的'], 0, '-ing 常表示主动、正在进行。'],
        ['哪一句正确？', ['Walking home, I saw a cat.', 'Walked home, I saw a cat.', 'Walking home, the cat was seen by I.'], 0, 'I 是 walking 的逻辑主语；第二句应用 -ing，第三句代词形式错误。']
      ],
      output: {
        prompt: '用 Doing..., I... 写一句。',
        sample: 'Walking to school, I met my friend.'
      }
    },
    {
      title: '被吓到，所以停下',
      subtitle: '-ed 短语作状语',
      scene: '团队被声音吓了一跳，停了下来。',
      sentence: 'Surprised by the sound, the team stopped.',
      translation: '团队被声音吓了一跳，停了下来。',
      tokens: [['Surprised by the sound', '非谓语/状语'], ['the team', '主语'], ['stopped', '谓语']],
      rule: '-ed 短语作状语，常表示被动或完成。它的逻辑主语也是主句主语。',
      tip: 'team 是“被吓到”，所以用 surprised，不是 surprising。',
      questions: [
        ['Surprised 的逻辑主语是谁？', ['the team', 'the sound', 'nobody'], 0, '是 the team 被吓到。'],
        ['Surprised 表示什么？', ['被动/完成', '主动/进行', '目的'], 0, '-ed 常表示被动或完成。'],
        ['哪一句正确？', ['Excited by the news, we cheered.', 'Exciting by the news, we cheered.', 'Excited by the news, the news cheered us.'], 0, 'we 是“被消息激励”，用 -ed；第三句逻辑主语混乱。']
      ],
      output: {
        prompt: '用 Excited / Surprised by..., I... 写一句。',
        sample: 'Surprised by the gift, she smiled.'
      }
    },
    {
      title: '为了找到珍珠',
      subtitle: '不定式 to do 表示目的',
      scene: '他们跑到山洞里，为了找到珍珠。',
      sentence: 'They ran to the cave to find the pearl.',
      translation: '他们跑到山洞里，为了找到珍珠。',
      tokens: [['They', '主语'], ['ran', '谓语'], ['to the cave', '状语'], ['to find the pearl', '目的状语/非谓语']],
      rule: '不定式 to do 可以表示目的：“为了做某事”。它也是非谓语，不能再当谓语。',
      tip: 'to the cave 的 to 是介词，后面接名词；to find 的 to 是不定式，后面接动词原形。',
      questions: [
        ['to find 表示什么？', ['目的', '原因', '结果'], 0, '“为了找到珍珠”表示目的。'],
        ['to the cave 里的 to 是什么？', ['介词', '不定式符号', '连词'], 0, 'to + 名词 the cave，to 是介词。'],
        ['哪一句正确？', ['She went out to buy milk.', 'She went out to bought milk.', 'She went out for buy milk.'], 0, 'to 后面接动词原形 buy。']
      ],
      output: {
        prompt: '用 ... to do ... 写一句目的。',
        sample: 'I opened the window to get fresh air.'
      }
    },
    {
      title: '三十天挑战：剥开最后一句',
      subtitle: '定语从句 + 被动 + 完成时',
      scene: '被藏了很多年的珍珠，终于被团队找到了。',
      sentence: 'The pearl, which had been hidden for years, was finally found by the team.',
      translation: '被藏了很多年的珍珠，终于被团队找到了。',
      tokens: [['The pearl', '主语'], ['which had been hidden for years', '非限制性定语从句'], ['was finally found', '谓语/被动'], ['by the team', '状语']],
      rule: '长句先剥修饰：主句 The pearl was finally found by the team；which... 补充说明珍珠。被动 + 定语从句 + 完成时，是阅读长句的常见组合。',
      tip: '先找主句的主语和谓语，再把逗号之间的定语从句拿掉。能剥掉，就能读懂。',
      questions: [
        ['主句的主语是哪个？', ['The pearl', 'which', 'the team'], 0, 'The pearl 是主句主语；which 引导定语从句。'],
        ['which 从句修饰哪个词？', ['pearl', 'team', 'years'], 0, 'which 指代先行词 the pearl。'],
        ['主句的谓语是哪个？', ['had been hidden', 'was found', 'was hiding'], 1, '主句谓语是 was finally found；had been hidden 在定语从句里。']
      ],
      output: {
        prompt: '用“主语 + 定语从句 + 被动谓语”写一句故事结尾。',
        sample: 'The key, which had been lost for days, was found by Xiaochao.'
      }
    }
  ];

  function letterAt(index) {
    return String.fromCharCode(65 + index);
  }

  function normalizeQuestion(raw, lessonId, index) {
    const options = (raw[1] || []).map((text, optionIndex) => ({
      letter: letterAt(optionIndex),
      text
    }));
    const answerIndex = Number(raw[2]) || 0;
    return {
      id: `${lessonId}-q${index + 1}`,
      n: index + 1,
      stem: raw[0],
      options,
      answer: letterAt(answerIndex),
      explanation: raw[3] || ''
    };
  }

  const lessons = RAW.map((item, index) => {
    const day = index + 1;
    const unit = UNITS.find((entry) => day >= entry.range[0] && day <= entry.range[1]) || UNITS[0];
    const id = `G${String(day).padStart(2, '0')}`;
    return {
      id,
      day,
      unit: unit.name,
      unitId: unit.id,
      unitColor: unit.color,
      title: item.title,
      subtitle: item.subtitle,
      scene: item.scene,
      sentence: item.sentence,
      translation: item.translation,
      tokens: item.tokens,
      rule: item.rule,
      tip: item.tip,
      questions: item.questions.map((question, questionIndex) => normalizeQuestion(question, id, questionIndex)),
      output: item.output
    };
  });

  function lessonByDay(day) {
    return lessons[clampDay(day) - 1] || null;
  }

  function clampDay(day) {
    const value = Math.round(Number(day) || 1);
    return Math.max(1, Math.min(lessons.length, value));
  }

  // 隔日复习：前几天越久，间隔越长；但仍在新单元里保持一次“混辨”。
  function reviewDayFor(day) {
    const value = Number(day) || 1;
    if (value <= 1) return 0;
    if (value <= 7) return value - 1;
    if (value <= 14) return value - 3;
    if (value <= 21) return value - 7;
    return value - 10;
  }

  function roleClass(role) {
    const text = String(role || '');
    if (text.includes('补')) return 'complement';
    if (text.includes('形式主语') || text.includes('真正主语')) return 'subject';
    if (text.includes('主语')) return 'subject';
    if (text.includes('谓语') || text.includes('系动词')) return 'predicate';
    if (text.includes('间接宾语') || text.includes('直接宾语') || text.includes('宾语')) return 'object';
    if (text.includes('表语')) return 'predicative';
    if (text.includes('定语')) return 'attributive';
    if (text.includes('状语')) return 'adverbial';
    if (text.includes('非谓语')) return 'nonfinite';
    if (text.includes('从句')) return 'clause';
    if (text.includes('连词')) return 'link';
    return 'other';
  }

  function cloneQuestion(question, overrides) {
    return {
      ...question,
      options: (question.options || []).map((option) => ({ ...option })),
      ...(overrides || {})
    };
  }

  function buildBlocks(lesson, reviewLesson) {
    const review = reviewLesson && reviewLesson.day < lesson.day
      ? cloneQuestion(reviewLesson.questions[0], {
          id: `${lesson.id}-review`,
          n: 4,
          stem: `复习 D${reviewLesson.day} · ${reviewLesson.questions[0].stem}`,
          explanation: `D${reviewLesson.day} 的重点：${reviewLesson.rule}`
        })
      : cloneQuestion(lesson.questions[0], {
          id: `${lesson.id}-review`,
          n: 4,
          stem: `热身 · 再看一眼：${lesson.questions[0].stem}`,
          explanation: lesson.questions[0].explanation
        });
    const blocks = [
      {
        id: `${lesson.id}-b1`,
        type: 'grammar',
        label: '第一关 · 找骨架',
        questions: [cloneQuestion(lesson.questions[0], { n: 1 })]
      },
      {
        id: `${lesson.id}-b2`,
        type: 'single',
        label: '第二关 · 懂意思',
        questions: [cloneQuestion(lesson.questions[1], { n: 2 })]
      },
      {
        id: `${lesson.id}-b3`,
        type: 'grammar',
        label: '第三关 · 用规则',
        questions: [cloneQuestion(lesson.questions[2], { n: 3 })]
      }
    ];
    if (review) {
      blocks.push({
        id: `${lesson.id}-b4`,
        type: 'grammar',
        label: '第四关 · 隔日复习',
        questions: [review]
      });
    }
    blocks.push({
      id: `${lesson.id}-b5`,
      type: 'writing',
      label: '第五关 · 写一句',
      prompt: lesson.output.prompt,
      sample: lesson.output.sample
    });
    return blocks;
  }

  function summary(lesson) {
    return {
      id: lesson.id,
      day: lesson.day,
      unit: lesson.unit,
      unitId: lesson.unitId,
      unitColor: lesson.unitColor,
      title: lesson.title,
      subtitle: lesson.subtitle,
      scene: lesson.scene,
      sentence: lesson.sentence,
      translation: lesson.translation,
      tokens: lesson.tokens,
      rule: lesson.rule,
      tip: lesson.tip,
      outputPrompt: lesson.output.prompt,
      outputSample: lesson.output.sample
    };
  }

  window.ShunshiGrammar = {
    version: 1,
    total: lessons.length,
    units: UNITS,
    lessons,
    lessonByDay,
    clampDay,
    reviewDayFor,
    roleClass,
    buildBlocks,
    summary
  };
})();
