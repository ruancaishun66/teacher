const config = require('../../config.js');

const PAGES = {
  home: { file: 'index.html', title: '顺势英语' },
  student: { file: 'student.html', title: '学生端' },
  teacher: { file: 'teacher.html', title: '教师端' },
  library: { file: 'library.html', title: '组卷工作台' }
};

Page({
  data: {
    url: '',
    title: '顺势英语'
  },

  onLoad(query) {
    const key = PAGES[query.page] ? query.page : 'student';
    const target = PAGES[key];
    this.setData({
      url: config.SITE + target.file,
      title: target.title
    });
    wx.setNavigationBarTitle({ title: target.title });
  },

  onError() {
    wx.showToast({
      title: '网页打不开，请检查业务域名',
      icon: 'none',
      duration: 4000
    });
  }
});
