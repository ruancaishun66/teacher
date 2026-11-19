/* ==========================================================================
   顺势 · 语法小营（进阶 30 天，D31–D60）
   在基础 30 天之后继续：从句进阶 → 非谓语 → 特殊结构 → 长难句与篇章。
   所有例句仍为“浅海侦探社”原创场景，不复制任何教材原句。
   ========================================================================== */
(function () {
  'use strict';

  const units = [
    { id: 'clause2', name: '从句进阶', range: [31, 38], color: '#c06a8a', note: '定语、宾语、状语、主语从句：先找连接词，再找从句自己的主干。' },
    { id: 'nonfinite2', name: '非谓语进阶', range: [39, 46], color: '#4f7fb8', note: '不定式、动名词、分词：一个句子里只能有一个谓语，其余动词要“降级”。' },
    { id: 'special', name: '特殊结构', range: [47, 53], color: '#8b6bb0', note: '倒装、强调、虚拟、省略、比较：读懂作者的“言外之意”。' },
    { id: 'discourse', name: '长难句与篇章', range: [54, 60], color: '#3f8f74', note: '把句子拆回主干，再顺着连接词读懂整段话。' }
  ];

  const raw = [
    {
      title: '定语从句：who 和 which',
      subtitle: '关系代词把两句话缝在一起',
      scene: '浅海侦探社来了一个陌生人。他手里拿着一枚旧徽章。',
      sentence: 'The stranger who came to the agency held an old badge.',
      translation: '来到侦探社的那个陌生人拿着一枚旧徽章。',
      tokens: [['The stranger', '主语'], ['who came to the agency', '定语从句'], ['held', '谓语'], ['an old badge', '宾语']],
      rule: '定语从句放在名词后面，说明“哪一个”。先行词是人时常用 who；是物时常用 which；that 两者都可以。',
      tip: '先找主句：The stranger held an old badge. 再看 who 从句只是给 stranger 加信息。',
      questions: [
        ['who 指代哪个词？', ['the agency', 'the stranger', 'the badge'], 1, 'who 指人，指前面的 the stranger。'],
        ['主句的谓语是哪个？', ['came', 'held', 'who'], 1, '主句是 The stranger held an old badge；came 在从句里。'],
        ['哪一句正确？', ['The badge who was old is missing.', 'The badge which was old is missing.', 'The badge which old is missing.'], 1, '先行词是物，用 which；从句要有自己的谓语 was。']
      ],
      output: { prompt: '用“人 + who 从句 + 主句谓语”写一句侦探社的场景。', sample: 'The girl who found the key looked worried.' }
    },
    {
      title: '定语从句：where 和 when',
      subtitle: '关系副词在从句里做状语',
      scene: '他们约在一间废弃的灯塔见面。那是小潮第一次见到星尾的地方。',
      sentence: 'The lighthouse where they met was the place where Xiaochao first saw Xingwei.',
      translation: '他们见面的那座灯塔，就是小潮第一次见到星尾的地方。',
      tokens: [['The lighthouse', '主语'], ['where they met', '定语从句'], ['was', '系动词'], ['the place', '表语'], ['where Xiaochao first saw Xingwei', '定语从句']],
      rule: 'where 在定语从句里代替“介词 + 地点”，when 代替“介词 + 时间”。从句本身仍然要有主语和谓语。',
      tip: 'where 不等于 which：where 后面不能直接跟一个完整的主谓宾，它自己已经在从句里作地点状语。',
      questions: [
        ['第一个 where 指什么？', ['the lighthouse', 'they', 'Xingwei'], 0, 'where 指前面的地点 the lighthouse。'],
        ['was 后面是什么成分？', ['宾语', '表语', '定语'], 1, 'was 是系动词，后面的 the place 是表语。'],
        ['哪一句正确？', ['The day where we met was rainy.', 'The day when we met was rainy.', 'The day when we met it was rainy.'], 1, '先行词是时间，用 when；从句里不再加 it。']
      ],
      output: { prompt: '用 where 或 when 写一句“那是我第一次……的地方/时候”。', sample: 'That was the night when the storm began.' }
    },
    {
      title: '非限制性定语从句',
      subtitle: '逗号后面的补充说明',
      scene: '旧徽章被放进证物袋。徽章背面刻着一串数字，这串数字让所有人安静下来。',
      sentence: 'The badge, which had a number on its back, silenced the room.',
      translation: '这枚徽章背面有一串数字，它让整个房间安静下来。',
      tokens: [['The badge', '主语'], [', which had a number on its back,', '非限制性定语从句'], ['silenced', '谓语'], ['the room', '宾语']],
      rule: '非限制性定语从句用逗号隔开，只补充信息，删掉后主句仍完整。它不能用 that，也不能用来限定“哪一个”。',
      tip: '限制性从句回答“哪一个”；非限制性从句只是“顺便说一句”。',
      questions: [
        ['删除逗号里的从句，主句还完整吗？', ['完整', '不完整', '缺少宾语'], 0, 'The badge silenced the room. 主句结构完整。'],
        ['这里能不能把 which 换成 that？', ['可以', '不可以', '只能换成 who'], 1, '非限制性定语从句不能用 that。'],
        ['哪一句标点正确？', ['The key, which was old, opened the door.', 'The key which, was old opened the door.', 'The key, that was old, opened the door.'], 0, '从句前后各一个逗号，且用 which。']
      ],
      output: { prompt: '写一句带非限制性定语从句的句子，补充一个人或物的信息。', sample: 'The letter, which was written in pencil, had no name.' }
    },
    {
      title: '宾语从句：陈述语序',
      subtitle: '从句里不要倒装',
      scene: '星尾问小潮：那个陌生人去了哪里？小潮说她不知道。',
      sentence: 'Xingwei asked where the stranger had gone, but Xiaochao said she did not know.',
      translation: '星尾问那个陌生人去了哪里，但小潮说她不知道。',
      tokens: [['Xingwei', '主语'], ['asked', '谓语'], ['where the stranger had gone', '宾语从句'], ['but', '连词'], ['Xiaochao', '主语'], ['said', '谓语'], ['she did not know', '宾语从句']],
      rule: '宾语从句用陈述语序：连接词 + 主语 + 谓语。即使主句是疑问句，从句也不要倒装。',
      tip: 'where did he go? 变成宾语从句是 where he went，不是 where did he go。',
      questions: [
        ['where 从句的主语是谁？', ['Xingwei', 'the stranger', 'Xiaochao'], 1, 'the stranger 是从句主语。'],
        ['said 后面的从句缺少什么？', ['主语', '宾语', '不缺成分'], 2, 'she did not know 结构完整，know 的宾语就是整个从句。'],
        ['哪一句正确？', ['She asked where did he live.', 'She asked where he lived.', 'She asked where he did live.'], 1, '宾语从句用陈述语序 where he lived。']
      ],
      output: { prompt: '写一句“某人问……在哪里/什么时候……”。', sample: 'I asked when the train would arrive.' }
    },
    {
      title: '宾语从句：时态呼应',
      subtitle: '主句过去，从句通常也过去',
      scene: '小潮回忆起三年前那个雨夜。她记得自己把钥匙藏在了哪里。',
      sentence: 'Xiaochao remembered where she had hidden the key three years before.',
      translation: '小潮记得三年前自己把钥匙藏在了哪里。',
      tokens: [['Xiaochao', '主语'], ['remembered', '谓语'], ['where she had hidden the key', '宾语从句'], ['three years before', '状语']],
      rule: '主句是过去时，宾语从句通常用相应的过去时。从句动作发生在主句之前，用过去完成时 had done。',
      tip: '如果从句说的是客观真理，即使主句过去，也用一般现在时：The teacher said the earth moves.',
      questions: [
        ['had hidden 发生在 remembered 之前还是之后？', ['之前', '之后', '同时'], 0, '过去完成时表示“过去的过去”。'],
        ['主句谓语是什么时态？', ['一般现在时', '一般过去时', '现在完成时'], 1, 'remembered 是一般过去时。'],
        ['哪一句符合时态呼应？', ['She said she is tired.', 'She said she was tired.', 'She said she will be tired.'], 1, '主句过去，从句通常用过去时 was。']
      ],
      output: { prompt: '写一句“我记得自己曾经……”。', sample: 'I remembered that I had left the window open.' }
    },
    {
      title: '时间状语从句',
      subtitle: 'when / while / before / after',
      scene: '雨停之前，他们已经沿着海岸走了两个小时。',
      sentence: 'They had walked along the coast for two hours before the rain stopped.',
      translation: '雨停之前，他们已经沿着海岸走了两个小时。',
      tokens: [['They', '主语'], ['had walked', '谓语'], ['along the coast', '状语'], ['for two hours', '状语'], ['before the rain stopped', '时间状语从句']],
      rule: '时间状语从句说明主句动作发生的时间。before 表示“在……之前”，after 表示“在……之后”，while 强调一段时间内同时发生。',
      tip: '时间状语从句里通常用一般现在时表示将来：We will leave before it gets dark.',
      questions: [
        ['主句动作和从句动作谁先发生？', ['走路', '雨停', '同时'], 0, 'before 说明走路发生在雨停之前。'],
        ['had walked 是什么时态？', ['过去完成时', '一般过去时', '现在完成时'], 0, 'had + 过去分词，是过去完成时。'],
        ['哪一句正确？', ['We will go after the rain stops.', 'We will go after the rain will stop.', 'We will go after the rain stopped.'], 0, '时间状语从句用一般现在时表示将来。']
      ],
      output: { prompt: '用 before 或 after 写一句你今天的时间顺序。', sample: 'I finished my homework before dinner started.' }
    },
    {
      title: '条件与让步状语从句',
      subtitle: 'if / unless / although',
      scene: '如果没有那串数字，他们永远找不到地下室。虽然危险，小潮还是决定下去。',
      sentence: 'Unless they decoded the number, they would never find the basement, although the stairs looked dangerous.',
      translation: '除非他们解开那串数字，否则永远找不到地下室，尽管楼梯看起来很危险。',
      tokens: [['Unless they decoded the number', '条件状语从句'], [', they', '主语'], ['would never find', '谓语'], ['the basement', '宾语'], [', although the stairs looked dangerous', '让步状语从句']],
      rule: 'if 表示“如果”，unless 表示“除非（如果不）”，although 表示“虽然”。条件从句和让步从句后面都跟完整的句子。',
      tip: 'although 不能和 but 同时用：Although it rained, we went out. 不说 Although it rained, but we went out.',
      questions: [
        ['unless 的意思最接近什么？', ['如果', '如果不', '因为'], 1, 'unless = if not。'],
        ['although 从句说明什么？', ['条件', '让步', '结果'], 1, 'although 表示让步，“虽然”。'],
        ['哪一句正确？', ['Although he was tired, but he continued.', 'Although he was tired, he continued.', 'Although he tired, he continued.'], 1, 'although 和 but 不能连用，从句也要有谓语 was。']
      ],
      output: { prompt: '用 although 写一句“虽然……还是……”。', sample: 'Although the road was dark, we kept walking.' }
    },
    {
      title: '主语从句与形式主语',
      subtitle: 'It 先占位，真正内容放后面',
      scene: '那枚徽章是谁留下的，仍然是个谜。',
      sentence: 'It is still a mystery who left the badge behind.',
      translation: '那枚徽章是谁留下的，仍然是个谜。',
      tokens: [['It', '形式主语'], ['is', '系动词'], ['still a mystery', '表语'], ['who left the badge behind', '主语从句']],
      rule: '主语从句太长时，常用 it 作形式主语，把真正的主语放到句末：It is + 形容词/名词 + that/who 从句。',
      tip: 'it 在这里没有实际意思，不能换成 this 或 that；真正的主语是后面的从句。',
      questions: [
        ['句子的真正主语是什么？', ['It', 'a mystery', 'who left the badge behind'], 2, 'it 只是形式主语，真正内容是后面的从句。'],
        ['is 后面是什么成分？', ['宾语', '表语', '定语'], 1, 'is 是系动词，a mystery 是表语。'],
        ['哪一句结构正确？', ['It is clear that he is lying.', 'It is clear who is he lying.', 'It clear that he is lying.'], 0, 'It is + 形容词 + that 从句，从句用陈述语序。']
      ],
      output: { prompt: '用 It is ... that ... 写一句你的发现。', sample: 'It is strange that the door was open.' }
    },
    {
      title: '不定式作主语和宾语',
      subtitle: 'to do 可以当名词用',
      scene: '要找到真相，需要耐心。小潮决定再检查一次监控。',
      sentence: 'To find the truth takes patience, so Xiaochao decided to check the video again.',
      translation: '找到真相需要耐心，所以小潮决定再检查一次监控。',
      tokens: [['To find the truth', '主语'], ['takes', '谓语'], ['patience', '宾语'], ['so', '连词'], ['Xiaochao', '主语'], ['decided', '谓语'], ['to check the video again', '宾语']],
      rule: '不定式 to + 动词原形可以作主语、宾语或目的状语。作主语时常后置，用 it 占位：It takes patience to find the truth.',
      tip: 'decide, hope, plan, want 后面常接 to do；不要写成 decide doing。',
      questions: [
        ['To find the truth 在句中作什么？', ['主语', '宾语', '状语'], 0, '不定式短语放在句首，作主语。'],
        ['decided 后面接什么形式？', ['doing', 'to do', 'done'], 1, 'decide 后面接不定式 to do。'],
        ['哪一句正确？', ['It is hard to keep a secret.', 'It is hard keep a secret.', 'It hard to keep a secret.'], 0, 'It is + 形容词 + to do，to 不能丢。']
      ],
      output: { prompt: '用 To do ... 或 decide to do ... 写一句。', sample: 'To solve the case, she decided to ask for help.' }
    },
    {
      title: '不定式作目的状语',
      subtitle: '为了……而做',
      scene: '为了不惊动守卫，他们从侧门进入。',
      sentence: 'They entered through the side door to avoid waking the guard.',
      translation: '他们从侧门进入，以免惊醒守卫。',
      tokens: [['They', '主语'], ['entered', '谓语'], ['through the side door', '状语'], ['to avoid waking the guard', '目的状语']],
      rule: 'to do 可以表示目的，“为了做某事”。否定目的用 in order not to do 或 so as not to do。',
      tip: '不要把目的状语和结果混淆：to avoid 是“为了避免”，不是“结果避免了”。',
      questions: [
        ['to avoid 表示什么？', ['目的', '结果', '原因'], 0, '“为了不惊醒守卫”是目的。'],
        ['avoid 后面接什么形式？', ['to do', 'doing', 'done'], 1, 'avoid 后面接动名词 doing。'],
        ['哪一句表示“为了不迟到”？', ['She ran so as not to be late.', 'She ran so as not being late.', 'She ran not to be late so.'], 0, '否定目的用 so as not to do。']
      ],
      output: { prompt: '用 to do 写一句“为了……，某人做了……”。', sample: 'I set an alarm to wake up early.' }
    },
    {
      title: '动名词作主语和宾语',
      subtitle: 'doing 也可以当名词',
      scene: '反复看同一段监控很枯燥，但小潮坚持记录每个细节。',
      sentence: 'Watching the same video repeatedly is boring, but Xiaochao keeps recording every detail.',
      translation: '反复看同一段监控很枯燥，但小潮坚持记录每个细节。',
      tokens: [['Watching the same video repeatedly', '主语'], ['is', '系动词'], ['boring', '表语'], ['but', '连词'], ['Xiaochao', '主语'], ['keeps', '谓语'], ['recording every detail', '宾语']],
      rule: '动名词 doing 可以作主语或宾语。enjoy, finish, mind, keep, avoid 等动词后面接 doing。',
      tip: '作主语的动名词看作单数：Watching videos is tiring.',
      questions: [
        ['Watching ... 在句中作什么？', ['主语', '谓语', '宾语'], 0, '句首的动名词短语作主语。'],
        ['keeps 后面为什么用 recording？', ['keep 后接动名词', '表示被动', '表示完成'], 0, 'keep doing 表示“持续做”。'],
        ['哪一句正确？', ['She enjoys to read.', 'She enjoys reading.', 'She enjoys read.'], 1, 'enjoy 后面接动名词。']
      ],
      output: { prompt: '用动名词写一句“做某事很……”。', sample: 'Listening to the rain helps me relax.' }
    },
    {
      title: '分词作定语',
      subtitle: '一个词顶一个从句',
      scene: '门口站着一个戴帽子的人。他手里拿着的信封已经湿透了。',
      sentence: 'The man standing at the door held a letter soaked by the rain.',
      translation: '站在门口的那个人拿着一封被雨浸湿的信。',
      tokens: [['The man', '主语'], ['standing at the door', '非谓语'], ['held', '谓语'], ['a letter', '宾语'], ['soaked by the rain', '非谓语']],
      rule: '现在分词 doing 表示主动、进行；过去分词 done 表示被动、完成。它们放在名词后面，相当于一个定语从句。',
      tip: 'the man standing = the man who is standing；the letter soaked = the letter which was soaked。',
      questions: [
        ['standing 和 man 是什么关系？', ['主动', '被动', '无关'], 0, 'man 自己站着，用现在分词。'],
        ['soaked 和 letter 是什么关系？', ['主动', '被动', '将来'], 1, '信被雨浸湿，用过去分词。'],
        ['哪一句正确？', ['The girl sat by the window is my sister.', 'The girl sitting by the window is my sister.', 'The girl sat by the window is my sister.'], 1, '女孩主动坐着，用现在分词 sitting。']
      ],
      output: { prompt: '用 doing 或 done 写一个带分词定语的名词短语。', sample: 'the box hidden under the bed' }
    },
    {
      title: '分词作状语',
      subtitle: '两个动作共享一个主语',
      scene: '听到脚步声，星尾立刻关掉了灯。',
      sentence: 'Hearing footsteps, Xingwei turned off the light at once.',
      translation: '听到脚步声，星尾立刻关掉了灯。',
      tokens: [['Hearing footsteps', '非谓语'], ['Xingwei', '主语'], ['turned off', '谓语'], ['the light', '宾语'], ['at once', '状语']],
      rule: '分词作状语时，分词的动作和主句主语是同一个。Hearing 的逻辑主语就是 Xingwei。',
      tip: '如果分词和主语是被动关系，用过去分词：Seen from the hill, the town looks small.',
      questions: [
        ['Hearing 的逻辑主语是谁？', ['footsteps', 'Xingwei', 'the light'], 1, '是星尾听到脚步声。'],
        ['这里为什么不用 Heard？', ['星尾主动听', '星尾被动听', 'heard 不能作状语'], 0, '星尾主动听，用现在分词。'],
        ['哪一句正确？', ['Walking home, the rain started.', 'Walking home, I saw the rain start.', 'Walked home, I saw the rain start.'], 1, '走路的人是 I，分词和主句主语一致。']
      ],
      output: { prompt: '用分词作状语写一句“看到/听到……，某人……”。', sample: 'Seeing the open door, she stopped.' }
    },
    {
      title: '过去分词与被动',
      subtitle: 'be done 与 done 的分工',
      scene: '地下室的门被锁了很多年。门上刻着的名字已经模糊。',
      sentence: 'The basement door had been locked for years, and the name carved on it was almost gone.',
      translation: '地下室的门已经被锁了很多年，门上刻着的名字几乎消失了。',
      tokens: [['The basement door', '主语'], ['had been locked', '谓语'], ['for years', '状语'], ['the name', '主语'], ['carved on it', '非谓语'], ['was', '系动词'], ['almost gone', '表语']],
      rule: '被动语态由 be + 过去分词构成；过去分词单独出现时不构成谓语，只表示被动或完成。',
      tip: 'had been locked 是谓语；carved on it 只是修饰 name，不是谓语。',
      questions: [
        ['had been locked 是什么结构？', ['被动语态', '过去分词作定语', '动名词'], 0, 'be + 过去分词，且前面有 had，构成过去完成时的被动。'],
        ['carved 在句中作什么？', ['谓语', '定语', '状语'], 1, 'carved on it 修饰 the name。'],
        ['哪一句正确？', ['The window broken by the boy.', 'The window was broken by the boy.', 'The window breaking by the boy.'], 1, '完整句子需要谓语 was broken。']
      ],
      output: { prompt: '用被动语态写一句“某物被……”。', sample: 'The letter was hidden under the floor.' }
    },
    {
      title: '独立主格',
      subtitle: '自带主语的状语',
      scene: '灯灭了，雨还在下，他们只能靠手电继续走。',
      sentence: 'The light gone and the rain still falling, they had to continue with a flashlight.',
      translation: '灯灭了，雨还在下，他们只能靠手电继续走。',
      tokens: [['The light gone', '独立主格'], ['the rain still falling', '独立主格'], ['they', '主语'], ['had to continue', '谓语'], ['with a flashlight', '状语']],
      rule: '独立主格是“名词 + 分词/形容词/介词短语”，有自己的逻辑主语，但不是完整句子。它常用来交代背景。',
      tip: '独立主格前通常有逗号，和主句分开；不要把 its 误写成 it is。',
      questions: [
        ['The light gone 的逻辑主语是谁？', ['they', 'the light', 'the rain'], 1, 'gone 说的是 the light。'],
        ['独立主格是不是完整句子？', ['是', '不是', '取决于逗号'], 1, '它没有限定谓语，不能单独成句。'],
        ['哪一句是独立主格？', ['The meeting over, everyone left.', 'The meeting was over, everyone left.', 'The meeting over and everyone left.'], 0, 'The meeting over 是名词 + 形容词，作独立主格。']
      ],
      output: { prompt: '用“名词 + 分词”写一个独立主格背景。', sample: 'The door open, she walked in.' }
    },
    {
      title: '非谓语的否定与完成式',
      subtitle: 'not to do / having done',
      scene: '为了不错过线索，他们没有立刻离开。查完所有抽屉后，他们才发现钥匙。',
      sentence: 'Not wanting to miss any clue, they did not leave at once; having checked every drawer, they finally found the key.',
      translation: '为了不错过任何线索，他们没有立刻离开；查完所有抽屉后，他们终于找到了钥匙。',
      tokens: [['Not wanting to miss any clue', '非谓语'], ['they', '主语'], ['did not leave', '谓语'], ['having checked every drawer', '非谓语'], ['they', '主语'], ['finally found', '谓语'], ['the key', '宾语']],
      rule: '非谓语的否定式把 not 放在最前面：not doing / not to do。完成式 having done 表示动作发生在主句之前。',
      tip: 'having checked 的逻辑主语仍是 they，且“检查”发生在“找到”之前。',
      questions: [
        ['Not wanting 的否定词放在哪里？', ['wanting 后面', '最前面', '句末'], 1, '非谓语否定式是 not + 非谓语。'],
        ['having checked 表示动作发生在什么时候？', ['主句之前', '主句之后', '同时'], 0, '完成式表示先发生。'],
        ['哪一句正确？', ['Not knowing the answer, he kept silent.', 'Knowing not the answer, he kept silent.', 'Not know the answer, he kept silent.'], 0, 'not 放在现在分词前。']
      ],
      output: { prompt: '用 Not doing ... 或 Having done ... 写一句。', sample: 'Not wanting to be late, he ran all the way.' }
    },
    {
      title: '倒装：否定词提前',
      subtitle: 'Never / Hardly / Not until',
      scene: '小潮从未见过这样的符号。直到她翻开最后一页，才明白它的意思。',
      sentence: 'Never had Xiaochao seen such a symbol; not until she turned the last page did she understand it.',
      translation: '小潮从未见过这样的符号；直到翻开最后一页，她才明白它的意思。',
      tokens: [['Never', '状语'], ['had Xiaochao seen', '谓语'], ['such a symbol', '宾语'], ['not until she turned the last page', '状语'], ['did she understand', '谓语'], ['it', '宾语']],
      rule: '否定副词 never, hardly, seldom 或 not until 放在句首时，主句要部分倒装：助动词 + 主语 + 动词。',
      tip: '倒装只把助动词提前，实义动词仍留在主语后面：did she understand，不是 did understand she。',
      questions: [
        ['Never 放在句首后，哪个词提前了？', ['seen', 'had', 'Xiaochao'], 1, '助动词 had 提到主语前。'],
        ['not until 从句为什么没倒装？', ['从句不倒装', '从句没有助动词', 'until 不能倒装'], 0, '倒装发生在主句，until 从句保持陈述语序。'],
        ['哪一句正确？', ['Seldom he goes out.', 'Seldom does he go out.', 'Seldom goes he out.'], 1, 'seldom 提前，主句用 does he go。']
      ],
      output: { prompt: '用 Never have I ... 写一句“我从未……”。', sample: 'Never have I seen such a strange map.' }
    },
    {
      title: '强调句 It is ... that ...',
      subtitle: '把重点夹在两个词之间',
      scene: '不是徽章本身，而是徽章背面的数字，让他们找到了地下室。',
      sentence: 'It was not the badge itself but the number on its back that led them to the basement.',
      translation: '不是徽章本身，而是徽章背面的数字，把他们引到了地下室。',
      tokens: [['It was', '强调结构'], ['not the badge itself but the number on its back', '被强调部分'], ['that', '强调结构'], ['led', '谓语'], ['them', '宾语'], ['to the basement', '状语']],
      rule: '强调句结构是 It is/was + 被强调部分 + that/who + 其余部分。去掉 It is 和 that，句子仍然完整。',
      tip: '强调人时可以用 who；强调时间、地点、原因时通常仍用 that。',
      questions: [
        ['被强调的部分是什么？', ['the badge itself', 'the number on its back', 'the basement'], 1, 'not ... but ... 的重点在 but 后面。'],
        ['去掉 It was 和 that，句子还完整吗？', ['完整', '不完整', '缺少主语'], 0, 'The number ... led them to the basement. 结构完整。'],
        ['哪一句是强调句？', ['It was in the box that she found the key.', 'It was in the box, she found the key.', 'It in the box that she found the key.'], 0, 'It was + 地点 + that + 完整句子。']
      ],
      output: { prompt: '用 It was ... that ... 强调一个时间、地点或人。', sample: 'It was at midnight that the phone rang.' }
    },
    {
      title: '虚拟语气：与现在相反',
      subtitle: 'If I were ...',
      scene: '如果小潮是侦探，她就会立刻报警。但她只是一个普通学生。',
      sentence: 'If Xiaochao were a detective, she would call the police at once.',
      translation: '如果小潮是侦探，她就会立刻报警。',
      tokens: [['If Xiaochao were a detective', '条件状语从句'], ['she', '主语'], ['would call', '谓语'], ['the police', '宾语'], ['at once', '状语']],
      rule: '与现在事实相反的虚拟条件句：If + 主语 + 过去式（be 用 were），主句用 would/could/might + 动词原形。',
      tip: '这只是假设，不是事实。不要把 were 改成 was（正式书面语中尤其如此）。',
      questions: [
        ['这句话描述的是事实还是假设？', ['事实', '假设', '过去事实'], 1, '她并不是侦探，所以是与现在相反的假设。'],
        ['主句为什么用 would call？', ['虚拟语气', '过去将来时', '被动语态'], 0, '与现在相反的虚拟，主句用 would + 动词原形。'],
        ['哪一句正确？', ['If I was you, I would apologize.', 'If I were you, I would apologize.', 'If I am you, I would apologize.'], 1, '虚拟语气中 be 动词常用 were。']
      ],
      output: { prompt: '用 If I were ... I would ... 写一句假设。', sample: 'If I were taller, I would join the team.' }
    },
    {
      title: '虚拟语气：wish 与建议',
      subtitle: '希望与“应该做”',
      scene: '星尾希望自己昨天没有丢下那枚徽章。老师建议他们先报警。',
      sentence: 'Xingwei wishes she had not left the badge behind, and the teacher suggested that they call the police first.',
      translation: '星尾希望自己昨天没有丢下那枚徽章，老师建议他们先报警。',
      tokens: [['Xingwei', '主语'], ['wishes', '谓语'], ['she had not left the badge behind', '宾语从句'], ['the teacher', '主语'], ['suggested', '谓语'], ['that they call the police first', '宾语从句']],
      rule: 'wish 后的从句用虚拟语气：与现在相反用过去式，与过去相反用 had done。suggest, advise, insist 等表示建议、要求时，从句常用 (should) + 动词原形。',
      tip: 'suggest 表示“暗示”时不用虚拟语气；这里表示“建议”，所以用 call。',
      questions: [
        ['had not left 表示与什么时候相反？', ['现在', '过去', '将来'], 1, 'wish + had done 表示对过去的遗憾。'],
        ['suggested 后面的 call 为什么不是 called？', ['虚拟语气', '被动语态', '现在完成时'], 0, '表示建议的 suggest 从句用 (should) + 动词原形。'],
        ['哪一句正确？', ['I wish I know the answer.', 'I wish I knew the answer.', 'I wish I have known the answer.'], 1, '与现在相反，wish 从句用过去式 knew。']
      ],
      output: { prompt: '用 I wish ... 写一句对现在或过去的遗憾。', sample: 'I wish I had brought an umbrella.' }
    },
    {
      title: '省略与替代',
      subtitle: '避免重复，让句子更轻',
      scene: '小潮能找到钥匙，星尾也能。他们都不想再等了。',
      sentence: 'Xiaochao can find the key, and so can Xingwei; neither of them wants to wait any longer.',
      translation: '小潮能找到钥匙，星尾也能；他们俩都不想再等了。',
      tokens: [['Xiaochao', '主语'], ['can find', '谓语'], ['the key', '宾语'], ['so can Xingwei', '倒装替代'], ['neither of them', '主语'], ['wants', '谓语'], ['to wait any longer', '宾语']],
      rule: 'so + 助动词 + 主语表示“某人也是”；neither + 助动词 + 主语表示“某人也不是”。这是省略与替代，避免重复整个谓语。',
      tip: 'so 开头的这种结构要倒装：so can Xingwei，不是 so Xingwei can。',
      questions: [
        ['so can Xingwei 替代了什么？', ['Xingwei can find the key', 'Xingwei cannot find the key', 'Xiaochao can find the key'], 0, 'so 表示前面肯定情况也适用于 Xingwei。'],
        ['neither 表示肯定还是否定？', ['肯定', '否定', '疑问'], 1, 'neither 表示“两者都不”。'],
        ['哪一句正确？', ['She likes tea, and so I do.', 'She likes tea, and so do I.', 'She likes tea, and I so do.'], 1, 'so + 助动词 do + 主语 I。']
      ],
      output: { prompt: '用 so do I 或 neither do I 回应一句。', sample: 'I enjoy reading, and so does my sister.' }
    },
    {
      title: '插入语与同位语',
      subtitle: '作者临时补充的信息',
      scene: '星尾，那个总戴帽子的女孩，在门口停了下来。她的发现——一枚旧钥匙——改变了计划。',
      sentence: 'Xingwei, the girl who always wore a hat, stopped at the door; her discovery, an old key, changed the plan.',
      translation: '星尾，那个总戴帽子的女孩，在门口停了下来；她的发现——一枚旧钥匙——改变了计划。',
      tokens: [['Xingwei', '主语'], ['the girl who always wore a hat', '同位语'], ['stopped', '谓语'], ['at the door', '状语'], ['her discovery', '主语'], ['an old key', '同位语'], ['changed', '谓语'], ['the plan', '宾语']],
      rule: '同位语用来说明前面的名词“具体是什么”，常用逗号、破折号或括号隔开。插入语是作者补充的态度或说明，删掉不影响句子主干。',
      tip: '同位语不是修饰语从句，它本身不说明“哪一个”，而是“就是什么”。',
      questions: [
        ['the girl who always wore a hat 说明谁？', ['Xingwei', 'the door', 'the plan'], 0, '它紧跟在 Xingwei 后面，是同位语。'],
        ['an old key 和 her discovery 是什么关系？', ['同位语', '定语从句', '状语'], 0, 'an old key 就是 her discovery 的内容。'],
        ['插入语删掉后，主句还完整吗？', ['完整', '不完整', '缺少宾语'], 0, '插入语只是补充信息。']
      ],
      output: { prompt: '用同位语介绍一个人或一件东西。', sample: 'My best friend, a quiet girl, loves detective stories.' }
    },
    {
      title: '比较结构',
      subtitle: 'as ... as / more ... than',
      scene: '这次线索比上次更清楚，但没有他们想的那么安全。',
      sentence: 'This clue is clearer than the last one, but it is not as safe as they expected.',
      translation: '这条线索比上一条更清楚，但没有他们想的那么安全。',
      tokens: [['This clue', '主语'], ['is', '系动词'], ['clearer', '表语'], ['than the last one', '比较状语'], ['it', '主语'], ['is', '系动词'], ['not as safe as they expected', '表语']],
      rule: '比较级用 -er/more + than；同级比较用 as + 形容词/副词原级 + as。比较的对象要一致。',
      tip: 'than 后面常用 one/that/those 替代前面出现过的名词，避免重复。',
      questions: [
        ['clearer 是比较级还是最高级？', ['比较级', '最高级', '原级'], 0, 'clearer + than 构成比较级。'],
        ['not as safe as 是什么意思？', ['和……一样安全', '不如……安全', '比……更安全'], 1, 'not as ... as 表示“不如……”。'],
        ['哪一句正确？', ['She is taller than me.', 'She is taller than I am.', 'She is more taller than me.'], 1, '正式书面语中比较对象要完整；more 不能和 -er 连用。']
      ],
      output: { prompt: '用比较级写一句“A 比 B 更……”。', sample: 'This road is longer than that one.' }
    },
    {
      title: '名词性从句综合',
      subtitle: '主语、宾语、表语、同位语',
      scene: '他们最担心的是：那个陌生人是否已经知道徽章的秘密。',
      sentence: 'What worried them most was whether the stranger already knew the secret of the badge.',
      translation: '最让他们担心的是，那个陌生人是否已经知道徽章的秘密。',
      tokens: [['What worried them most', '主语从句'], ['was', '系动词'], ['whether the stranger already knew the secret of the badge', '表语从句']],
      rule: '名词性从句可以作主语、宾语、表语或同位语。what 在从句里充当成分；whether 表示“是否”，不能用 if 直接作主语从句开头。',
      tip: 'What worried them 是“让他们担心的事”，不是疑问句“什么让他们担心”。',
      questions: [
        ['What worried them most 作什么成分？', ['主语', '宾语', '表语'], 0, '整个从句放在句首作主语。'],
        ['whether 从句作什么成分？', ['宾语', '表语', '定语'], 1, 'was 后面说明主语的内容，是表语从句。'],
        ['哪一句正确？', ['If he will come is unknown.', 'Whether he will come is unknown.', 'That he will come is unknown or not.'], 1, '主语从句“是否”用 whether，不用 if。']
      ],
      output: { prompt: '用 What ... is ... 写一句“最……的是……”。', sample: 'What surprised me was that the door was unlocked.' }
    },
    {
      title: '多重从句拆解',
      subtitle: '先找主句，再一层层剥',
      scene: '小潮发现，星尾提到的那个房间，正是他们昨晚经过却没有进去的地方。',
      sentence: 'Xiaochao realized that the room Xingwei had mentioned was the place they had passed but never entered the night before.',
      translation: '小潮意识到，星尾提到的那个房间，正是他们前一晚经过却没有进去的地方。',
      tokens: [['Xiaochao', '主语'], ['realized', '谓语'], ['that the room Xingwei had mentioned was the place they had passed but never entered the night before', '宾语从句']],
      rule: '长句先找主句谓语 realized，再看 that 引导的宾语从句。宾语从句里又套了省略关系词的定语从句 Xingwei had mentioned 和 they had passed。',
      tip: '每遇到一个从句，先圈出它的连接词/先行词，再找它自己的主谓，不要被修饰成分带跑。',
      questions: [
        ['整句的主句谓语是什么？', ['realized', 'mentioned', 'passed'], 0, 'Xiaochao realized ... 是主句。'],
        ['Xingwei had mentioned 修饰哪个词？', ['Xiaochao', 'the room', 'the place'], 1, '它紧跟在 the room 后面，是省略了 that/which 的定语从句。'],
        ['the place they had passed 中，they had passed 修饰什么？', ['the place', 'the room', 'the night'], 0, 'they had passed 修饰 the place，省略了 that/which。']
      ],
      output: { prompt: '写一句“某人发现，……正是……的地方”。', sample: 'She realized that the box they had found was the one her father had hidden.' }
    },
    {
      title: '平行结构',
      subtitle: 'and / or / but 两边要对称',
      scene: '侦探社的工作是观察、记录和提问——不是猜测、拖延或逃避。',
      sentence: 'Detective work means observing, recording and asking questions, not guessing, delaying or running away.',
      translation: '侦探工作意味着观察、记录和提问，而不是猜测、拖延或逃避。',
      tokens: [['Detective work', '主语'], ['means', '谓语'], ['observing, recording and asking questions', '宾语'], ['not guessing, delaying or running away', '宾语']],
      rule: 'and, or, but 连接的结构要平行：名词对名词、动词对动词、短语对短语。平行结构能让长句更清楚。',
      tip: '不要把 doing 和 to do 混在同一个并列里：observing, recording and asking，而不是 observing, recording and to ask。',
      questions: [
        ['observing / recording / asking 为什么能并列？', ['都是动名词', '都是谓语', '都是形容词'], 0, '三个都是动名词，结构一致。'],
        ['not 后面的三个词也是什么形式？', ['动名词', '不定式', '过去式'], 0, 'guessing, delaying, running 都是动名词。'],
        ['哪一句平行结构正确？', ['She likes reading, writing and to draw.', 'She likes reading, writing and drawing.', 'She likes to read, writing and draw.'], 1, '三个并列成分都用动名词。']
      ],
      output: { prompt: '用三个并列的动名词写一句“侦探工作意味着……”。', sample: 'Good writing means planning, drafting and revising.' }
    },
    {
      title: '代词指代',
      subtitle: 'they / it / this 到底指什么',
      scene: '旧钥匙打不开地下室的门。它太小了，而门锁又太旧。这把钥匙可能是另一扇门的。',
      sentence: 'The old key could not open the basement door; it was too small, and the lock was too old. This key might belong to another door.',
      translation: '旧钥匙打不开地下室的门；它太小了，而锁又太旧。这把钥匙可能是另一扇门的。',
      tokens: [['The old key', '主语'], ['could not open', '谓语'], ['the basement door', '宾语'], ['it', '主语'], ['was', '系动词'], ['too small', '表语'], ['This key', '主语'], ['might belong to', '谓语'], ['another door', '宾语']],
      rule: '代词要指代明确。it 通常指前面最近的可指代名词；this/that 可指代前面整句话或一件事。',
      tip: '如果一句里有多个名词，改用“the key / the lock”这样的名词重复，比连续用 it 更清楚。',
      questions: [
        ['第二个 it 指什么？', ['the door', 'the key', 'the lock'], 1, 'it was too small 说的是钥匙。'],
        ['This key 为什么用 this 而不是 it？', ['强调“这把”', '表示复数', '表示被动'], 0, 'this 有指示作用，强调“这一把”。'],
        ['哪一句指代最清楚？', ['The key hit the lock, but it was old.', 'The key hit the lock, but the lock was old.', 'The key hit it, but it was old.'], 1, '重复 the lock 消除歧义。']
      ],
      output: { prompt: '写两句话，用 it 或 this 明确指代前文。', sample: 'The map was torn. This made the search harder.' }
    },
    {
      title: '连接词与篇章逻辑',
      subtitle: 'however / therefore / besides',
      scene: '线索很少。然而，他们并没有放弃。因此，他们决定重新走访每个证人。',
      sentence: 'The clues were few. However, they did not give up; therefore, they decided to revisit every witness.',
      translation: '线索很少。然而，他们没有放弃；因此，他们决定重新走访每个证人。',
      tokens: [['The clues', '主语'], ['were', '系动词'], ['few', '表语'], ['However', '连接词'], ['they', '主语'], ['did not give up', '谓语'], ['therefore', '连接词'], ['they', '主语'], ['decided', '谓语'], ['to revisit every witness', '宾语']],
      rule: '连接词表达篇章关系：however 转折，therefore 因果，besides 递进，meanwhile 同时。它们帮助读者预测下一句的方向。',
      tip: 'however 和 therefore 是副词，不是连词；连接两个完整句子时，前面通常用分号或句号。',
      questions: [
        ['However 表示什么关系？', ['因果', '转折', '递进'], 1, 'however 表示“然而”。'],
        ['therefore 后面的决定和前面是什么关系？', ['原因', '结果', '对比'], 1, '因为线索少又不放弃，所以决定重新走访。'],
        ['哪一句使用正确？', ['They were tired, however they continued.', 'They were tired; however, they continued.', 'They were tired however they continued.'], 1, 'however 连接两个句子时，前面用分号，后面加逗号。']
      ],
      output: { prompt: '用 however 或 therefore 写两句有逻辑关系的话。', sample: 'The road was long. Therefore, we started early.' }
    },
    {
      title: '长难句综合：阅读拆句',
      subtitle: '主干—修饰—连接',
      scene: '那封被认为已经丢失的信，最终在一个谁也没想到的抽屉里被找到了，而抽屉的钥匙一直挂在门口。',
      sentence: 'The letter, which was believed to have been lost, was finally found in a drawer that no one had thought of, while its key had been hanging by the door all along.',
      translation: '那封被认为已经丢失的信，最终在一个谁也没想到的抽屉里被找到了，而抽屉的钥匙一直挂在门口。',
      tokens: [['The letter', '主语'], [', which was believed to have been lost,', '非限制性定语从句'], ['was finally found', '谓语'], ['in a drawer', '状语'], ['that no one had thought of', '定语从句'], [', while its key had been hanging by the door all along', '状语从句']],
      rule: '长难句先抓主句 The letter was found。which 从句补充说明信，that 从句修饰 drawer，while 从句交代同时背景。',
      tip: '看到逗号、which、that、while，先问“它在给谁加信息”，再回到主句。',
      questions: [
        ['主句的核心结构是什么？', ['The letter was found', 'The letter was believed', 'The key had been hanging'], 0, '主句是 The letter was finally found。'],
        ['that no one had thought of 修饰什么？', ['the letter', 'a drawer', 'the key'], 1, 'that 紧跟在 a drawer 后面。'],
        ['while 从句交代什么？', ['原因', '同时背景', '目的'], 1, 'while 表示“而、与此同时”。']
      ],
      output: { prompt: '写一句含一个定语从句和一个状语从句的长句，再划出主干。', sample: 'The book, which I had borrowed, was returned after the library closed.' }
    },
    {
      title: '语法综合复盘：写作检查',
      subtitle: '把 60 天收成一张检查表',
      scene: '小潮把 60 天的笔记摊在桌上。她发现，真正让句子清楚的，不是难词，而是清楚的主干和关系。',
      sentence: 'What makes a sentence clear is not a difficult word but a clear main clause and the right connections.',
      translation: '让句子清楚的，不是难词，而是清楚的主句和恰当的关系。',
      tokens: [['What makes a sentence clear', '主语从句'], ['is', '系动词'], ['not a difficult word but a clear main clause and the right connections', '表语']],
      rule: '写完一句长句，按四步检查：1) 找谓语；2) 找主干；3) 看从句连接词；4) 看并列是否平行。',
      tip: '先写短句，再合并；不要为了“高级”堆从句。清楚永远比复杂重要。',
      questions: [
        ['What makes a sentence clear 作什么成分？', ['主语', '宾语', '表语'], 0, '主语从句作主语。'],
        ['not ... but ... 连接的两部分是什么关系？', ['转折对比', '因果', '条件'], 0, 'not A but B 表示“不是 A 而是 B”。'],
        ['改长句时，第一步应该做什么？', ['先加难词', '先找谓语和主干', '先加从句'], 1, '先找谓语和主干，再处理修饰。']
      ],
      output: { prompt: '用“What ... is not ... but ...”写一句你对学习的理解。', sample: 'What helps me improve is not speed but daily practice.' }
    }
  ];

  window.ShunshiGrammarAdvanced = { units, raw };
})();
